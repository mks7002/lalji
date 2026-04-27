const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const projectRoot = path.join(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const databaseDir = path.join(projectRoot, "database");
const db = new Database(path.join(databaseDir, "lalji.db"));

const defaultAdminId = process.env.ADMIN_ID || "laljiadmin";
const defaultAdminPassword = process.env.ADMIN_PASSWORD || "LalJi@123";

const defaultProducts = [
  ["Cement", "Premium Cement", "Reliable strength and smooth finishing for residential and commercial work.", 420, "bag"],
  ["Steel", "TMT Steel Bars", "High-strength reinforcement bars for durable structural support.", 72000, "ton"],
  ["Bricks", "Red Clay Bricks", "Well-shaped bricks for walls, boundary work, and foundation needs.", 9, "piece"],
  ["Sand", "River Sand", "Suitable for plastering, masonry, and quality concrete mixing.", 3200, "trolley"],
  ["Aggregate", "Crushed Aggregate", "Construction-grade stone material for concrete and roadwork needs.", 2900, "trolley"],
  ["Plumbing", "PVC Pipes & Fittings", "Useful plumbing solutions for homes, shops, and utility lines.", 550, "set"],
  ["Finishing", "Wall Putty & Paint", "Surface finishing materials for neat, durable, and attractive walls.", 1350, "pack"],
  ["Outdoor", "Interlocking Tiles", "Practical paving solution for pathways, parking, and outdoor spaces.", 38, "piece"]
];

const defaultRates = [
  ["Cement", "Rs. 380 - 430 / bag", "50 kg branded bag, Uttar Pradesh reference range"],
  ["TMT Steel", "Rs. 70 - 82 / kg", "Typical branded saria rate for UP markets"],
  ["Bricks", "Rs. 7,500 - 9,500 / 1000", "Awwal grade clay brick reference range"],
  ["Fine Sand", "Rs. 65 - 90 / cu ft", "Maurang and local sand reference range"],
  ["Aggregate", "Rs. 800 - 1,400 / ton", "20mm construction aggregate reference range"]
];

function nowStamp() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Calcutta" });
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const separator = item.indexOf("=");
      if (separator > -1) {
        acc[item.slice(0, separator)] = decodeURIComponent(item.slice(separator + 1));
      }
      return acc;
    }, {});
}

function initDb() {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      admin_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      unit TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      updated_on TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rate TEXT NOT NULL,
      detail TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      address TEXT NOT NULL,
      timeline TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      notes TEXT,
      total REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      contact_email TEXT,
      contact_message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const orderColumns = db.prepare("PRAGMA table_info(orders)").all();
  if (!orderColumns.some((column) => column.name === "status")) {
    db.prepare("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'Pending'").run();
  }

  const admin = db.prepare("SELECT id FROM admins WHERE username = ?").get(defaultAdminId);
  if (!admin) {
    db.prepare("INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)").run(
      defaultAdminId,
      bcrypt.hashSync(defaultAdminPassword, 10),
      nowStamp()
    );
  }

  const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  if (productCount === 0) {
    const insert = db.prepare(
      "INSERT INTO products (slug, category, name, description, price, unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    defaultProducts.forEach((product) => {
      insert.run(slugify(product[1]), product[0], product[1], product[2], product[3], product[4], nowStamp());
    });
  }

  const rateCount = db.prepare("SELECT COUNT(*) AS count FROM rates").get().count;
  if (rateCount === 0) {
    db.prepare("INSERT OR REPLACE INTO rate_meta (id, updated_on) VALUES (1, ?)").run("April 26, 2026");
    const insert = db.prepare("INSERT INTO rates (name, rate, detail) VALUES (?, ?, ?)");
    defaultRates.forEach((rate) => insert.run(rate[0], rate[1], rate[2]));
  }
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies.lalji_session) {
    return null;
  }
  return db
    .prepare(
      `SELECT sessions.token, admins.id AS admin_id, admins.username
       FROM sessions JOIN admins ON admins.id = sessions.admin_id
       WHERE sessions.token = ?`
    )
    .get(cookies.lalji_session);
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.adminSession = session;
  next();
}

function listProducts() {
  return db.prepare("SELECT * FROM products ORDER BY id DESC").all();
}

function listRates() {
  const meta = db.prepare("SELECT updated_on FROM rate_meta WHERE id = 1").get();
  return {
    updatedOn: meta ? meta.updated_on : "",
    items: db.prepare("SELECT * FROM rates ORDER BY id ASC").all()
  };
}

function listOrders() {
  const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
  const items = db.prepare("SELECT * FROM order_items ORDER BY id ASC").all();
  return orders.map((order) => ({
    ...order,
    total: Number(order.total),
    items: items
      .filter((item) => item.order_id === order.id)
      .map((item) => ({
        name: item.name,
        quantity: Number(item.quantity),
        price: Number(item.price)
      }))
  }));
}

function listInquiries() {
  return db.prepare("SELECT * FROM inquiries ORDER BY id DESC").all();
}

initDb();

app.use(express.json());
app.use(express.static(publicDir, { extensions: ["html"] }));

app.get("/api/storefront", (req, res) => {
  res.json({ products: listProducts(), rates: listRates() });
});

app.post("/api/orders", (req, res) => {
  const { customerName, phoneNumber, address, timeline, paymentMethod, notes, items } = req.body;
  if (!customerName || !phoneNumber || !address || !timeline || !paymentMethod || !Array.isArray(items) || !items.length) {
    res.status(400).json({ error: "Missing order details" });
    return;
  }

  const total = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
  const insertOrder = db.prepare(
    "INSERT INTO orders (customer_name, phone_number, address, timeline, payment_method, status, notes, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const orderResult = insertOrder.run(customerName, phoneNumber, address, timeline, paymentMethod, "Pending", notes || "", total, nowStamp());
  const insertItem = db.prepare("INSERT INTO order_items (order_id, name, quantity, price) VALUES (?, ?, ?, ?)");
  items.forEach((item) => insertItem.run(orderResult.lastInsertRowid, item.name, Number(item.quantity), Number(item.price)));
  res.status(201).json({ message: "Order placed successfully" });
});

app.post("/api/inquiries", (req, res) => {
  const { contactName, contactPhone, contactEmail, contactMessage } = req.body;
  if (!contactName || !contactPhone || !contactMessage) {
    res.status(400).json({ error: "Missing inquiry details" });
    return;
  }

  db.prepare(
    "INSERT INTO inquiries (contact_name, contact_phone, contact_email, contact_message, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(contactName, contactPhone, contactEmail || "", contactMessage, nowStamp());
  res.status(201).json({ message: "Inquiry submitted successfully" });
});

app.get("/api/admin/session", (req, res) => {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, username: session.username });
});

app.post("/api/admin/login", (req, res) => {
  const { adminId, adminPassword } = req.body;
  if (!adminId || !adminPassword) {
    res.status(400).json({ error: "Missing login details" });
    return;
  }

  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(adminId);
  if (!admin || !bcrypt.compareSync(adminPassword, admin.password_hash)) {
    res.status(401).json({ error: "Invalid admin ID or password" });
    return;
  }

  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO sessions (token, admin_id, created_at) VALUES (?, ?, ?)").run(token, admin.id, nowStamp());
  res.setHeader("Set-Cookie", `lalji_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`);
  res.json({ message: "Login successful" });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.adminSession.token);
  res.setHeader("Set-Cookie", "lalji_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
  res.json({ message: "Logged out" });
});

app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  res.json({
    products: listProducts(),
    rates: listRates(),
    orders: listOrders(),
    inquiries: listInquiries()
  });
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  const { name, category, price, unit, description } = req.body;
  if (!name || !category || !price || !unit || !description) {
    res.status(400).json({ error: "Missing product details" });
    return;
  }
  db.prepare(
    "INSERT INTO products (slug, category, name, description, price, unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(slugify(`${name}-${Date.now()}`), category, name, description, Number(price), unit, nowStamp());
  res.status(201).json({ message: "Product created" });
});

app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  const { name, category, price, unit, description } = req.body;
  db.prepare(
    "UPDATE products SET category = ?, name = ?, description = ?, price = ?, unit = ? WHERE id = ?"
  ).run(category, name, description, Number(price), unit, Number(req.params.id));
  res.json({ message: "Product updated" });
});

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(Number(req.params.id));
  res.json({ message: "Product deleted" });
});

app.put("/api/admin/rates", requireAdmin, (req, res) => {
  const { updatedOn, items } = req.body;
  if (!updatedOn || !Array.isArray(items)) {
    res.status(400).json({ error: "Missing rate details" });
    return;
  }
  db.prepare("INSERT OR REPLACE INTO rate_meta (id, updated_on) VALUES (1, ?)").run(updatedOn);
  db.prepare("DELETE FROM rates").run();
  const insert = db.prepare("INSERT INTO rates (name, rate, detail) VALUES (?, ?, ?)");
  items.forEach((item) => {
    if (item.name && item.rate && item.detail) {
      insert.run(item.name, item.rate, item.detail);
    }
  });
  res.json({ message: "Rates updated" });
});

app.delete("/api/admin/orders", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM order_items").run();
  db.prepare("DELETE FROM orders").run();
  res.json({ message: "Orders cleared" });
});

app.delete("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const orderId = Number(req.params.id);
  db.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);
  db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
  res.json({ message: "Order deleted" });
});

app.put("/api/admin/orders/:id/status", requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ["Pending", "Confirmed", "Delivered", "Cancelled"];
  if (!allowedStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid order status" });
    return;
  }

  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, Number(req.params.id));
  res.json({ message: "Order status updated" });
});

app.delete("/api/admin/inquiries", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM inquiries").run();
  res.json({ message: "Inquiries cleared" });
});

app.delete("/api/admin/inquiries/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM inquiries WHERE id = ?").run(Number(req.params.id));
  res.json({ message: "Inquiry deleted" });
});

app.use((req, res) => {
  if (req.path === "/admin" || req.path === "/admin.html") {
    res.sendFile(path.join(publicDir, "admin.html"));
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Lal Ji Traders app running on http://localhost:${PORT}`);
});
