const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const port = process.env.PORT || 5000;

// Create an HTTP server with the Express app
const server = http.createServer(app);

// Middlewares:
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hwapsgs.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();

    // Select the database and collection
    const db = client.db("chatApp");
    const messagesCollection = db.collection("messages");

    // Initialize Socket.IO server with the HTTP server instance
    const io = new Server(server, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
      },
    });

    io.on("connection", (socket) => {
      console.log("A user connected:", socket.id);

      // Listen for incoming messages
      socket.on("message", async (msg) => {
        console.log("Received message:", msg);
        // Broadcast the message to all clients, including the sender
        io.emit("message", msg);
        // Save the message to MongoDB
        const messageDocument = {
          message: msg,
          timestamp: new Date(), // Record the time the message was sent
          userId: socket.id, // Optionally store the user id (socket id)
        };
        await messagesCollection.insertOne(messageDocument);
      });

      socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
      });
    });

    // get message from client side:
    app.get("/api/messages", async (req, res) => {
      try {
        const messages = await db.collection("messages").find().toArray();
        res.json(messages);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch messages" });
      }
    });
    // app.get("/api/messages", async (req, res) => {
    //   try {
    //     const messagesCollection = client.db("chatApp").collection("messages");
    //     const messages = await messagesCollection
    //       .find()
    //       .sort({ timestamp: 1 })
    //       .toArray();
    //     res.status(200).json(messages);
    //   } catch (error) {
    //     console.error("Failed to retrieve messages:", error);
    //     res.status(500).json({ error: "Failed to retrieve messages" });
    //   }
    // });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("An error occurred while connecting to MongoDB:", error);
  } finally {
    // The client is not closed here so the connection remains active for the server.
    // await client.close(); // Commented out to keep the connection open
  }
}
run().catch(console.dir);

// Server start:
app.get("/", (req, res) => {
  res.send("Socket.IO server is running");
});

server.listen(port, () => {
  console.log(`Socket.IO server is running on port: ${port}`);
});
