const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();

// Sanitize the port value
const port = parseInt(process.env.PORT, 10) || 4000;

// Debugging log
console.log(`Configured port: ${port}`);

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173",
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());

//token verification
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    res.send({ message: "no token" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_KEY_TOKEN, (err, decoded) => {
    if (err) {
      res.send({ message: "invalid token" });
    }
    req.decoded = decoded;
    next();
  });
};

// verify seller
const verifySeller = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email: email };
  const user = await userCollection.findOne(query);
  if (user?.role !== "seller") {
    return res.send({ message: "forbidden access." });
  }
  next();
};

// middleware

const url = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wt8oomr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(url, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const userCollection = client.db("e-commerce").collection("users");
const productCollection = client.db("e-commerce").collection("products");

const dbConnect = async () => {
  try {
    client.connect();
    console.log("database connect succesfully");

    //get user
    app.get("/user/:email", async (req, res) => {
      const query = { email: req.params.email };
      const user = await userCollection.findOne(query);
      // if (user) {
      //   return res.send({ message: "no user found" });
      // }
      res.send(user);
    });

    // insert user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already Exist" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //add product
    app.post("/add-products", verifyJWT, verifySeller, async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    //gets prouducts
    app.get("/all-products", async (req, res) => {
      //name searching, sort by price, filter by category, filter by brand
      const { title, sort, category, brand } = req.query;

      const query = {};
      if (title) {
        query.title = { $regex: title, $options: "i" };
      }
      // if (category) {
      //   query.category = category;
      // }
      if (category) {
        query.category = { $regex: category, $options: "i" };
      }
      if (brand) {
        query.brand = brand;
      }

      const sortOption = sort === "asc" ? 1 : -1;
      const products = await productCollection
        .find(query)
        .sort({ price: sortOption })
        .toArray();

      res.json(products);
    });
  } catch (error) {
    console.log(error, error.name, error.message);
  }
};

dbConnect();

// API routes
app.get("/", (req, res) => {
  res.send("Server is running");
});

//jwt
app.post("/authentication", async (req, res) => {
  const userEmail = req.body;
  const token = jwt.sign(userEmail, process.env.ACCESS_KEY_TOKEN, {
    expiresIn: "10d",
  });
  res.send({ token });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
