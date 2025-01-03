const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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

// verify Admin
const verifyAdmin = async (req, res, next) => {
  const email = req.body.email;
  const query = { email: email };
  const user = await userCollection.findOne(query);

  if (user?.role !== "admin") {
    return res.status(403).send({ message: "Forbidden Access" });
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

    //get all users
    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find({}).toArray();
      res.send(users);
    });

    // Delete User by admin
    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;

      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount > 0) {
        res.status(200).send({ message: "User deleted successfully." });
      } else {
        res.status(404).send({ message: "User not found." });
      }
    });

    // Edit user Role By admin
    app.patch("/users/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      const updatedUser = await userCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { role } },
        { returnDocument: "after" }
      );
      res.json(updatedUser.value);
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

    // my Products
    app.get("/my-products", verifyJWT, verifySeller, async (req, res) => {
      try {
        const sellerEmail = req.decoded.email; // Extract seller's email from decoded token
        const query = { sellerEmail: sellerEmail }; // Filter products by seller's email

        const products = await productCollection.find(query).toArray(); // Fetch all products for this seller
        res.send(products);
      } catch (error) {
        console.error("Error fetching my products:", error.message);
        res.status(500).send({ message: "Failed to fetch products" });
      }
    });

    //gets prouducts
    app.get("/all-products", async (req, res) => {
      //name searching, sort by price, filter by category, filter by brand
      const { title, sort, category, brand, page = 1, limit = 9 } = req.query;

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

      const pageNumber = Number(page);
      const limitNumber = Number(limit);

      const sortOption = sort === "asc" ? 1 : -1;
      const products = await productCollection
        .find(query)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .sort({ price: sortOption })
        .toArray();

      const totalProducts = await productCollection.countDocuments(query);

      const productInfo = await productCollection
        .find({}, { projection: { category: 1, brand: 1 } })
        .toArray();

      const brands = [...new Set(productInfo.map((product) => product.brand))];
      const categories = [
        ...new Set(productInfo.map((product) => product.category)),
      ];

      res.json({ products, brands, categories, totalProducts });
    });

    //add to wishlist
    app.patch("/wishlist/add", async (req, res) => {
      const { userEmail, productId } = req.body;
      const result = await userCollection.updateOne(
        {
          email: userEmail,
        },
        { $addToSet: { wishlist: new ObjectId(String(productId)) } }
      );

      res.send(result);
    });

    //get data from wishlist
    app.get("/wishlist/:userId", verifyJWT, async (req, res) => {
      const userId = req.params.userId;
      const user = await userCollection.findOne({
        _id: new ObjectId(String(userId)),
      });
      if (!user) {
        return res.send({ message: "User not Found!" });
      }

      const wishlist = await productCollection
        .find({
          _id: { $in: user.wishlist || [] },
        })
        .toArray();

      res.send(wishlist);
    });

    //remove from wishlist
    app.patch("/wishlist/remove", async (req, res) => {
      const { userEmail, productId } = req.body;
      const result = await userCollection.updateOne(
        {
          email: userEmail,
        },
        { $pull: { wishlist: new ObjectId(String(productId)) } }
      );

      res.send(result);
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
