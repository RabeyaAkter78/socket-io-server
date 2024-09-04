const express = require("express");
const multer = require("multer"); //for image upload
const cors = require("cors");
const path = require("path"); // Import the path module for file upload.
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const port = process.env.PORT || 5000;
const server = http.createServer(app);

// create directory for save the upload image:
const fs = require("fs");
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// Set up storage with destination and filename configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Save files in the public/uploads directory
    cb(null, path.join(__dirname, "public", "uploads"));
  },
  filename: function (req, file, cb) {
    // Use a unique filename with the original file extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// Initialize upload middleware
const upload = multer({ storage: storage });

// Middlewares
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hwapsgs.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("chatApp");
    const messagesCollection = db.collection("messages");
    const usersCollection = db.collection("users");

    const io = new Server(server, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
      },
    });

    const users = {};

    io.on("connection", (socket) => {
      console.log("A user connected:", socket.id);

      socket.on("register", (userId) => {
        users[userId] = socket.id;
        // console.log(`${userId} registered with socket id: ${socket.id}`);
      });

      // Listen for broadcast messages (to all users including the sender)
      socket.on("broadcast_message", async (msg) => {
        // console.log(msg);
        socket.broadcast.emit("message", msg);

        const messageDocument = {
          message: msg,
          timestamp: new Date(),
          userId: socket.id,
        };
        await messagesCollection.insertOne(messageDocument);
      });

      // Handle sending private messages
      socket.on("sendMessage", async (receiverId, message) => {
        const receiverSocketId = users[receiverId];
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("receiveMessage", message);

          // Save the message to the database
          const messageDocument = {
            message,
            timestamp: new Date(),
            senderId: socket.id,
            receiverId,
          };
          await messagesCollection.insertOne(messageDocument);
          console.log(
            `Message sent from ${socket.id} to ${receiverId}: ${message}`
          );
        } else {
          console.log(`User ${receiverId} is not connected`);
        }
      });

      socket.on("disconnect", () => {
        // console.log("User disconnected:", socket.id);

        // Remove the user from the users object
        for (const userId in users) {
          if (users[userId] === socket.id) {
            delete users[userId];
            break;
          }
        }
      });
    });

    // Endpoint to get messages from the database
    app.get("/api/messages", async (req, res) => {
      try {
        const messages = await messagesCollection.find().toArray();
        res.json(messages);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch messages" });
      }
    });

    // Handle user registration with image upload
    app.post("/api/users", upload.single("avatar"), async (req, res) => {
      try {
        const { name, email, password } = req.body;
        let avatarUrl = null;

        // Check if a file is uploaded and construct the avatar URL
        if (req.file) {
          avatarUrl = `/uploads/${req.file.filename}`;
        }

        // Create a user object to be inserted into the database
        const user = {
          name,
          email,
          password,
          avatarUrl,
        };

        // Insert the user into the database
        const result = await usersCollection.insertOne(user);
        const registerUserId = result.insertedId;
        // console.log(registerUserId);
        // Send a response once after successfully saving the user
        res.status(201).json({ success: true, registerUserId, file: req.file });
        // .json({ success: true, userId: result.insertedId, file: req.file });
      } catch (error) {
        // console.error("Error saving user:", error);

        // Send an error response if something goes wrong
        res
          .status(500)
          .json({ success: false, error: "Internal Server Error" });
      }
    });

    // Serve the uploaded images statically
    app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

    // Get Users:
    app.get("/api/users", async (req, res) => {
      const result = await usersCollection.find().toArray([]);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("An error occurred while connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Socket.IO server is running");
});

server.listen(port, () => {
  console.log(`Socket.IO server is running on port: ${port}`);
});
