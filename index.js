const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const port = process.env.PORT || 5000;
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

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
        console.log(`${userId} registered with socket id: ${socket.id}`);
      });

      // Listen for broadcast messages (to all users including the sender)
      socket.on("broadcast_message", async (msg) => {
        // Emit the message to all connected clients
        console.log(msg);
        // io.emit("message", msg);
        socket.broadcast.emit("message", msg);
        // Save the message to MongoDB
        const messageDocument = {
          message: msg,
          timestamp: new Date(),
          userId: socket.id,
        };
        await messagesCollection.insertOne(messageDocument);
      });

      // Listen for private messages
      // socket.on("private_message", ({ to, message }) => {
      //   const targetSocketId = users[to];
      //   if (targetSocketId) {
      //     io.to(targetSocketId).emit("message", { message, from: "Private" });
      //     console.log(
      //       `Sent private message from ${socket.id} to ${targetSocketId}: ${message}`
      //     );
      //   } else {
      //     console.log(`User ${to} is not connected`);
      //   }
      // });

      socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

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
