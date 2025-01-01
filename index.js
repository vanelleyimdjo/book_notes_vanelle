import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import env from "dotenv";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";

const app = express();
const port = 3000;
const apiURL = "https://covers.openlibrary.org/b/";
env.config();
const saltRounds = 10;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();

// google

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/secrets",
  passport.authenticate("google", {
    successRedirect: "/home",
    failureRedirect: "/log",
  })
);

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/secrets",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        console.log(profile);
        const result = await db.query("SELECT * FROM users WHERE email = $1", [
          profile.email,
        ]);
        if (result.rows.length === 0) {
          const newUser = await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2)",
            [profile.email, "google"]
          );
          return cb(null, newUser.rows[0]);
        } else {
          return cb(null, result.rows[0]);
        }
      } catch (err) {
        return cb(err);
      }
    }
  )
);
passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

// gooogle

app.get("/", (req, res) => {
  res.render("login.ejs");
});

app.get("/add", (req, res) => {
  res.render("new.ejs");
});
app.get("/contact", (req, res) => {
  res.render("partials/contact.ejs");
});

app.post("/log", async (req, res) => {
  const email = req.body.username_login;
  const loginPassword = req.body.password_login;

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const storedHashedPassword = user.password;
      //verifying the password
      bcrypt.compare(loginPassword, storedHashedPassword, (err, result) => {
        if (err) {
          console.error("Error comparing passwords:", err);
        } else {
          if (result) {
            res.redirect("/home");
          } else {
            res.send("Incorrect Password");
          }
        }
      });
    } else {
      res.send("User not found");
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      res.send("Email already exists. Try logging in.");
    } else {
      //hashing the password and saving it in the database
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          console.log("Hashed Password:", hash);
          await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2)",
            [email, hash]
          );
          res.redirect("/home");
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

function shortenBookTitle(title) {
  // Split the title into an array of words
  const words = title.split(" ");
  // Define a list of definite and indefinite articles and other words to filter
  const filterWords = [
    "the",
    "a",
    "an",
    "of",
    "by",
    "can",
    "could",
    "may",
    "might",
    "must",
    "shall",
    "should",
    "will",
    "would",
    "I",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "me",
    "him",
    "her",
    "us",
    "them",
  ];

  const hyphenIndex = words.indexOf("-");
  const colonIndex = words.indexOf(":");

  // Filter out articles and other specified words from the array of words before the "-" or ":" character
  let filteredWords;
  if (hyphenIndex !== -1) {
    filteredWords = words
      .slice(0, hyphenIndex)
      .filter((word) => !filterWords.includes(word.toLowerCase()));
  } else if (colonIndex !== -1) {
    filteredWords = words
      .slice(0, colonIndex)
      .filter((word) => !filterWords.includes(word.toLowerCase()));
  } else {
    filteredWords = words.filter(
      (word) => !filterWords.includes(word.toLowerCase())
    );
  }

  // Check for - in the first word after filtering
  for (let i = 0; i < filteredWords.length; i++) {
    const filteredWord = filteredWords[i];

    if (filteredWord.includes("-")) {
      const hyphenIndex = filteredWord.indexOf("-");
      if (hyphenIndex - 1 !== " ") {
        filteredWords[i] = filteredWord.replace("-", "");
      } else {
        filteredWords = filteredWord.slice(0, hyphenIndex);
      }
    } else if (filteredWord.includes(":")) {
      const colonIndex = filteredWord.indexOf(":");
      filteredWords[i] = filteredWord.replace(":", "");
    }
  }

  // Capitalize the first letter of each word and join the words back together

  const shortenedTitle = filteredWords
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return shortenedTitle;
}

app.post("/add", (req, res) => {
  const { title, author, date_read, review } = req.body;
  const isbn = Number(req.body.isbn);
  const rating = parseInt(req.body.rating);
  const route = shortenBookTitle(title);

  try {
    db.query(
      "INSERT INTO books (title,author,isbn,rating,date_read,review,route) VALUES ($1, $2,$3,$4,$5,$6,$7)",
      [title, author, isbn, rating, date_read, review, route]
    );

    res.redirect("/home");
  } catch (error) {
    console.log(error.message);
    res.render("new.ejs");
  }
});

let books = [];

let notes = [];

// Request book covers from the api

async function getBookCover(booksList) {
  const requests = booksList.map((book, index) => {
    const url = apiURL + "isbn/" + book.isbn + "-M.jpg";
    return axios.get(url);
  });

  try {
    const responses = await Promise.all(requests);
    const covers = responses.map((response) => response.config.url);
    return covers;
  } catch (error) {
    console.log(`Error fetching book covers: ${error.message}`);
    return [];
  }
}

let TypeSort = "id";

function checkSorting(checkSort) {
  const listColumn = ["id", "rating", "title", "date_read"];

  if (listColumn.includes(checkSort)) {
    TypeSort = checkSort;
    console.log("we are here" + TypeSort);
  } else {
    console.log("prevented injection");
    TypeSort = "id";
  }
}

app.get("/home", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM books ORDER BY ${TypeSort} ASC`
    );
    books = result.rows;
    const bookCovers = await getBookCover(books);
    res.render("index.ejs", { books, bookCovers, shortenBookTitle });
  } catch (error) {
    console.log(error.message);
  }
});

app.get("/book/:name", async (req, res) => {
  const paramName = req.params.name;
  if (paramName !== "add" && paramName !== "edit") {
    try {
      console.log(`Current route is /${paramName}`);
      const result = await db.query(
        "SELECT * FROM books INNER JOIN notes on books.id = notes.book_id where books.route = $1",
        [paramName]
      );
      notes = result.rows;
      // console.log(notes);

      const pBooksResult = await db.query(
        "SELECT * FROM books where books.route = $1",
        [paramName]
      );

      const selectedBook = pBooksResult.rows[0];
      const currentBookId = selectedBook.id;

      const bookCovers = await getBookCover(books);
      console.log(bookCovers);
      const bookCover = bookCovers[currentBookId - 1];
      // console.log(currentBookId);
      // console.log(selectedBook);
      res.render("read_note.ejs", { notes, selectedBook, bookCover });
    } catch (error) {
      console.log(error.message);
      res.redirect("/home");
    }
  } else if (paramName === "add") {
    res.render("new.ejs");
  }
});

app.post("/edit", async (req, res) => {
  const reviewId = req.body.id;
  try {
    const result = await db.query(
      "SELECT review FROM BOOKS WHERE books.id = $1",
      [reviewId]
    );
    const oldReview = result.rows[0];

    res.render("review.ejs", { oldReview, reviewId });
  } catch (error) {
    console.log(error.message);
  }
});

app.post("/submit", async (req, res) => {
  const id = req.body.id;
  const review = req.body.review;

  try {
    const result = await db.query(
      "UPDATE BOOKS SET review = $1 WHERE books.id = $2 RETURNING *",
      [review, id]
    );
    const currentRoute = result.rows[0].route;
    res.redirect(`/${currentRoute}`);
  } catch (error) {
    console.log(error.message);
  }
});

app.post("/sort", (req, res) => {
  try {
    sortType = req.body.sort;
    checkSorting(sortType);
    res.redirect("/home");
  } catch (error) {
    console.log(error.message);
  }
});

app.post("/delete/:id", async (req, res) => {
  const noteId = req.params.id;
  const route = req.body.route;

  try {
    const result = db.query("DELETE FROM notes WHERE notes.note_id = $1", [
      noteId,
    ]);
    res.redirect(`/${route}`);
  } catch (error) {
    console.log(error.message);
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
