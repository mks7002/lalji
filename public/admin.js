const adminLoginScreen = document.getElementById("adminLoginScreen");
const adminApp = document.getElementById("adminApp");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminLoginMessage = document.getElementById("adminLoginMessage");
const productForm = document.getElementById("productForm");
const cancelProductEdit = document.getElementById("cancelProductEdit");
const productFormTitle = document.getElementById("productFormTitle");
const adminProductList = document.getElementById("adminProductList");
const ratesForm = document.getElementById("ratesForm");
const adminRateFields = document.getElementById("adminRateFields");
const addRateFieldButton = document.getElementById("addRateFieldButton");
const adminRatesPreview = document.getElementById("adminRatesPreview");
const ordersList = document.getElementById("ordersList");
const inquiriesList = document.getElementById("inquiriesList");
const adminStats = document.getElementById("adminStats");
const toast = document.getElementById("toast");
const clearOrdersButton = document.getElementById("clearOrdersButton");
const clearInquiriesButton = document.getElementById("clearInquiriesButton");
const logoutButton = document.getElementById("logoutButton");

let dashboardData = {
  products: [],
  rates: { updatedOn: "", items: [] },
  orders: [],
  inquiries: []
};

function formatCurrency(value) {
  const parts = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  })
    .formatToParts(value)
    .filter((part) => part.type !== "currency")
    .map((part) => part.value)
    .join("")
    .trim();

  return `Rs. ${parts}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2400);
}

function getFormValues(formElement) {
  return Object.fromEntries(new FormData(formElement).entries());
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setAdminVisible(loggedIn) {
  adminLoginScreen.hidden = loggedIn;
  adminApp.hidden = !loggedIn;
}

function renderStats() {
  adminStats.innerHTML = `
    <p class="card-title">Business Snapshot</p>
    <div class="stat-grid">
      <article><strong>${dashboardData.products.length} Products</strong><span>Live on the storefront</span></article>
      <article><strong>${dashboardData.rates.items.length} Rate Items</strong><span>Updated ${dashboardData.rates.updatedOn}</span></article>
      <article><strong>${dashboardData.orders.length} Orders</strong><span>Saved customer requests</span></article>
      <article><strong>${dashboardData.inquiries.length} Inquiries</strong><span>Contact messages received</span></article>
    </div>
  `;
}

function resetProductForm() {
  productForm.reset();
  productForm.elements.productId.value = "";
  productFormTitle.textContent = "Add Product";
  cancelProductEdit.hidden = true;
}

function renderProductsAdmin() {
  adminProductList.innerHTML = dashboardData.products
    .map(
      (product) => `
        <article class="admin-item-card">
          <div>
            <strong>${product.name}</strong>
            <p>${product.category} | ${formatCurrency(product.price)} / ${product.unit}</p>
            <small>${product.description}</small>
          </div>
          <div class="result-actions">
            <button class="btn btn-secondary admin-edit-product" type="button" data-id="${product.id}">Edit</button>
            <button class="btn btn-secondary admin-delete-product" type="button" data-id="${product.id}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  document.querySelectorAll(".admin-edit-product").forEach((button) => {
    button.addEventListener("click", () => {
      const product = dashboardData.products.find((item) => String(item.id) === button.dataset.id);
      productForm.elements.productId.value = product.id;
      productForm.elements.name.value = product.name;
      productForm.elements.category.value = product.category;
      productForm.elements.price.value = product.price;
      productForm.elements.unit.value = product.unit;
      productForm.elements.description.value = product.description;
      productFormTitle.textContent = "Edit Product";
      cancelProductEdit.hidden = false;
      productForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  document.querySelectorAll(".admin-delete-product").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await apiFetch(`/api/admin/products/${button.dataset.id}`, { method: "DELETE" });
        await loadDashboard();
        showToast("Product deleted.");
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function createRateField(item = { name: "", rate: "", detail: "" }) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-rate-field";
  wrapper.innerHTML = `
    <label>
      Material Name
      <input type="text" name="rateName" value="${item.name || ""}" required>
    </label>
    <label>
      Rate
      <input type="text" name="rateValue" value="${item.rate || ""}" required>
    </label>
    <label class="full-width">
      Detail
      <input type="text" name="rateDetail" value="${item.detail || ""}" required>
    </label>
    <button class="text-button remove-rate-field" type="button">Remove</button>
  `;
  wrapper.querySelector(".remove-rate-field").addEventListener("click", () => wrapper.remove());
  adminRateFields.appendChild(wrapper);
}

function renderRatesAdmin() {
  ratesForm.elements.updatedOn.value = dashboardData.rates.updatedOn;
  adminRateFields.innerHTML = "";
  dashboardData.rates.items.forEach((item) => createRateField(item));
  adminRatesPreview.innerHTML = dashboardData.rates.items
    .map(
      (item) => `
        <article class="rate-card">
          <strong>${item.name}</strong>
          <span>${item.rate}</span>
          <small>${item.detail}</small>
        </article>
      `
    )
    .join("");
}

function renderOrders() {
  ordersList.innerHTML = dashboardData.orders.length
    ? dashboardData.orders
        .map(
          (order) => `
            <article class="admin-record-card">
              <div class="admin-record-head">
                <strong>${order.customer_name}</strong>
                <span>${order.created_at}</span>
              </div>
              <div class="order-status-row">
                <span class="status-badge status-${String(order.status || "Pending").toLowerCase()}">${order.status || "Pending"}</span>
                <select class="order-status-select" data-id="${order.id}">
                  ${["Pending", "Confirmed", "Delivered", "Cancelled"]
                    .map(
                      (status) => `<option value="${status}" ${status === (order.status || "Pending") ? "selected" : ""}>${status}</option>`
                    )
                    .join("")}
                </select>
              </div>
              <p><strong>Phone:</strong> ${order.phone_number}</p>
              <p><strong>Address:</strong> ${order.address}</p>
              <p><strong>Payment:</strong> ${order.payment_method}</p>
              <p><strong>Timeline:</strong> ${order.timeline}</p>
              <p><strong>Total:</strong> ${formatCurrency(order.total)}</p>
              <p><strong>Items:</strong> ${order.items.map((item) => `${item.name} x ${item.quantity}`).join(", ")}</p>
              <p><strong>Notes:</strong> ${order.notes || "None"}</p>
              <button class="text-button delete-order-button" type="button" data-id="${order.id}">Delete Order</button>
            </article>
          `
        )
        .join("")
    : '<p class="empty-state">No orders yet. New order submissions will appear here.</p>';

  document.querySelectorAll(".delete-order-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await apiFetch(`/api/admin/orders/${button.dataset.id}`, { method: "DELETE" });
        await loadDashboard();
        showToast("Order deleted.");
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  document.querySelectorAll(".order-status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await apiFetch(`/api/admin/orders/${select.dataset.id}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: select.value })
        });
        await loadDashboard();
        showToast("Order status updated.");
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderInquiries() {
  inquiriesList.innerHTML = dashboardData.inquiries.length
    ? dashboardData.inquiries
        .map(
          (inquiry) => `
            <article class="admin-record-card">
              <div class="admin-record-head">
                <strong>${inquiry.contact_name}</strong>
                <span>${inquiry.created_at}</span>
              </div>
              <p><strong>Phone:</strong> ${inquiry.contact_phone}</p>
              <p><strong>Email:</strong> ${inquiry.contact_email || "Not provided"}</p>
              <p><strong>Message:</strong> ${inquiry.contact_message}</p>
              <button class="text-button delete-inquiry-button" type="button" data-id="${inquiry.id}">Delete Inquiry</button>
            </article>
          `
        )
        .join("")
    : '<p class="empty-state">No inquiries yet. Contact form submissions will appear here.</p>';

  document.querySelectorAll(".delete-inquiry-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await apiFetch(`/api/admin/inquiries/${button.dataset.id}`, { method: "DELETE" });
        await loadDashboard();
        showToast("Inquiry deleted.");
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderAllAdmin() {
  renderStats();
  renderProductsAdmin();
  renderRatesAdmin();
  renderOrders();
  renderInquiries();
}

async function loadDashboard() {
  dashboardData = await apiFetch("/api/admin/dashboard", { headers: {} });
  dashboardData.products = dashboardData.products.map((product) => ({
    ...product,
    price: Number(product.price)
  }));
  renderAllAdmin();
}

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = getFormValues(productForm);
  const payload = {
    name: values.name.trim(),
    category: values.category.trim(),
    price: Number(values.price),
    unit: values.unit.trim(),
    description: values.description.trim()
  };

  try {
    if (values.productId) {
      await apiFetch(`/api/admin/products/${values.productId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      await apiFetch("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
    resetProductForm();
    await loadDashboard();
    showToast("Product saved.");
  } catch (error) {
    showToast(error.message);
  }
});

cancelProductEdit.addEventListener("click", resetProductForm);

addRateFieldButton.addEventListener("click", () => {
  createRateField();
});

ratesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const updatedOn = ratesForm.elements.updatedOn.value.trim();
  const items = Array.from(adminRateFields.querySelectorAll(".admin-rate-field"))
    .map((field) => ({
      name: field.querySelector('[name="rateName"]').value.trim(),
      rate: field.querySelector('[name="rateValue"]').value.trim(),
      detail: field.querySelector('[name="rateDetail"]').value.trim()
    }))
    .filter((item) => item.name && item.rate && item.detail);

  try {
    await apiFetch("/api/admin/rates", {
      method: "PUT",
      body: JSON.stringify({ updatedOn, items })
    });
    await loadDashboard();
    showToast("Rate board updated.");
  } catch (error) {
    showToast(error.message);
  }
});

clearOrdersButton.addEventListener("click", async () => {
  try {
    await apiFetch("/api/admin/orders", { method: "DELETE" });
    await loadDashboard();
    showToast("All orders cleared.");
  } catch (error) {
    showToast(error.message);
  }
});

clearInquiriesButton.addEventListener("click", async () => {
  try {
    await apiFetch("/api/admin/inquiries", { method: "DELETE" });
    await loadDashboard();
    showToast("All inquiries cleared.");
  } catch (error) {
    showToast(error.message);
  }
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = getFormValues(adminLoginForm);

  try {
    await apiFetch("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(values)
    });
    adminLoginForm.reset();
    adminLoginMessage.textContent = "Login successful.";
    setAdminVisible(true);
    await loadDashboard();
    showToast("Admin login successful.");
  } catch (error) {
    adminLoginMessage.textContent = error.message;
    showToast("Login failed.");
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await apiFetch("/api/admin/logout", { method: "POST" });
  } catch (error) {
    // Ignore logout errors.
  }
  setAdminVisible(false);
  adminLoginMessage.textContent = "You have been logged out.";
  showToast("Logged out successfully.");
});

async function init() {
  resetProductForm();
  try {
    await apiFetch("/api/admin/session", { headers: {} });
    setAdminVisible(true);
    await loadDashboard();
  } catch (error) {
    setAdminVisible(false);
  }
}

init();
