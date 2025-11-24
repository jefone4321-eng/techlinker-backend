const express = require("express");
const db = require("./db");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// =============================
//        SIGN UP
// =============================
app.post("/signup", (req, res) => {
    const { fullname, email, password } = req.body;

    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) return res.json({ error: "Hashing error" });

        const sql = "INSERT INTO users (fullname, email, password) VALUES (?, ?, ?)";
        db.query(sql, [fullname, email, hashedPassword], (err, result) => {
            if (err) {
                return res.json({ error: "Email already used" });
            }
            return res.json({ message: "Signup successful!" });
        });
    });
});

// =============================
//          LOGIN
// =============================
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    const sql = "SELECT * FROM users WHERE email = ?";
    db.query(sql, [email], (err, data) => {
        if (err) return res.json({ error: "Database error" });
        if (data.length === 0) return res.json({ error: "User not found" });

        const user = data[0];

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (!isMatch) {
                return res.json({ error: "Incorrect password" });
            }
            return res.json({ message: "Login successful", user });
        });
    });
});

// =============================
//      START SERVER
// =============================
app.listen(4000, () => {
    console.log("🚀 Server running on port 4000");
});
