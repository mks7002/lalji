const cart = [];

const businessConfig = {
  businessName: "Lal Ji Traders",
  email: "orders@laljitraders.in",
  razorpayKey: "rzp_test_replace_with_your_key"
};

const paymentInstructions = {
  "Cash on Delivery": "Cash on Delivery selected. Our team will confirm availability and delivery before dispatch.",
  UPI: "UPI selected. Share your UPI ID or complete payment after order confirmation.",
  "Bank Transfer": "Bank Transfer selected. Bank details can be shared with you after the order is reviewed.",
  "Online Gateway": "Online Gateway selected. Use the Pay Online button to launch the Razorpay checkout after confirming your order details."
};

const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");
const paymentMethod = document.getElementById("paymentMethod");
const paymentNote = document.getElementById("paymentNote");
const checkoutForm = document.getElementById("checkoutForm");
const contactForm = document.getElementById("contactForm");
const estimatorForm = document.getElementById("estimatorForm");
const toast = document.getElementById("toast");
const orderResult = document.getElementById("orderResult");
const inquiryResult = document.getElementById("inquiryResult");
const ratesUpdatedOn = document.getElementById("ratesUpdatedOn");
const ratesGrid = document.getElementById("ratesGrid");
const productGrid = document.getElementById("productGrid");
const estimatorResult = document.getElementById("estimatorResult");
const estimateTotal = document.getElementById("estimateTotal");
const estimateRate = document.getElementById("estimateRate");
const estimateArea = document.getElementById("estimateArea");
const estimateMaterials = document.getElementById("estimateMaterials");

const estimatorRates = {
  economy: 1550,
  standard: 1900,
  premium: 2450
};

let products = [];

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

function renderProducts() {
  productGrid.innerHTML = products
    .map(
      (product) => `
        <article class="product-card" data-product-id="${product.id}">
          <span class="product-tag">${product.category}</span>
          <h3>${product.name}</h3>
          <p>${product.description}</p>
          <label class="product-quantity-control">
            <span>Quantity (${product.unit})</span>
            <input class="product-quantity-input" type="number" min="1" step="1" value="1">
          </label>
          <div class="product-meta">
            <strong>${formatCurrency(product.price)} / ${product.unit}</strong>
            <button class="btn btn-primary add-to-cart" type="button">Add to Order</button>
          </div>
        </article>
      `
    )
    .join("");

  document.querySelectorAll(".add-to-cart").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".product-card");
      const product = products.find((item) => String(item.id) === card.dataset.productId);
      const quantityInput = card.querySelector(".product-quantity-input");
      const quantity = Math.max(1, Number(quantityInput.value) || 1);
      addToCart(product, quantity);
      quantityInput.value = "1";
    });
  });
}

function renderDailyRates(rates) {
  ratesUpdatedOn.textContent = rates.updatedOn;
  ratesGrid.innerHTML = rates.items
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

function updateCartUI() {
  cartCount.textContent = String(cart.reduce((sum, item) => sum + item.quantity, 0));

  if (!cart.length) {
    cartItems.innerHTML = '<p class="empty-state">Your order cart is empty. Add products above to begin.</p>';
    cartTotal.textContent = "Rs. 0";
    return;
  }

  cartItems.innerHTML = cart
    .map(
      (item, index) => `
        <div class="cart-line">
          <div>
            <strong>${item.name}</strong>
            <span>Qty: ${item.quantity} x ${formatCurrency(item.price)}</span>
          </div>
          <button class="text-button" type="button" data-remove-index="${index}">Remove</button>
        </div>
      `
    )
    .join("");

  const total = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
  cartTotal.textContent = formatCurrency(total);

  document.querySelectorAll("[data-remove-index]").forEach((button) => {
    button.addEventListener("click", () => {
      cart.splice(Number(button.dataset.removeIndex), 1);
      updateCartUI();
      showToast("Item removed from order.");
    });
  });
}

function addToCart(product, quantity) {
  const existing = cart.find((item) => item.id === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ ...product, quantity });
  }
  updateCartUI();
  showToast(`${quantity} ${product.unit}(s) of ${product.name} added to your order.`);
}

function handlePaymentMethodChange() {
  const selected = paymentMethod.value;
  paymentNote.textContent = selected
    ? paymentInstructions[selected]
    : "Choose a payment method to see instructions.";
}

function openGatewayCheckout(prefill = {}) {
  if (!cart.length) {
    showToast("Add at least one product before online payment.");
    return;
  }

  if (typeof window.Razorpay === "undefined") {
    showToast("Payment gateway could not load. Check internet or your gateway setup.");
    return;
  }

  const amount = cart.reduce((sum, item) => sum + item.quantity * item.price, 0) * 100;

  const options = {
    key: businessConfig.razorpayKey,
    amount,
    currency: "INR",
    name: businessConfig.businessName,
    description: "Building material order",
    prefill: {
      name: prefill.customerName || "",
      contact: prefill.phoneNumber || "",
      email: prefill.contactEmail || businessConfig.email
    },
    theme: {
      color: "#b4572d"
    },
    handler(response) {
      showToast(`Payment successful. Payment ID: ${response.razorpay_payment_id}`);
    }
  };

  const razorpay = new window.Razorpay(options);
  razorpay.open();
}

function calculateHomeEstimate(formData) {
  const area = Number(formData.area);
  const floors = Number(formData.floors);
  const baseRate = estimatorRates[formData.quality];
  const finishingMultiplier = formData.finishing === "yes" ? 1.12 : 1;
  const floorMultiplier = floors === 1 ? 1 : floors === 2 ? 1.05 : 1.1;
  const totalBuiltArea = area * floors;
  const finalRate = Math.round(baseRate * finishingMultiplier * floorMultiplier);
  const totalCost = totalBuiltArea * finalRate;
  const materialBudget = Math.round(totalCost * 0.58);

  return {
    finalRate,
    totalBuiltArea,
    totalCost,
    materialBudget
  };
}

document.getElementById("clearCartButton").addEventListener("click", () => {
  cart.length = 0;
  updateCartUI();
  showToast("Order cart cleared.");
});

document.getElementById("viewCartButton").addEventListener("click", () => {
  document.getElementById("order").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("gatewayButton").addEventListener("click", () => {
  const prefill = getFormValues(checkoutForm);
  openGatewayCheckout(prefill);
});

paymentMethod.addEventListener("change", handlePaymentMethodChange);

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!cart.length) {
    showToast("Please add products before submitting your order.");
    return;
  }

  const formData = getFormValues(checkoutForm);

  try {
    await apiFetch("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        customerName: formData.customerName,
        phoneNumber: formData.phoneNumber,
        address: formData.address,
        timeline: formData.timeline,
        paymentMethod: formData.paymentMethod,
        notes: formData.notes,
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        }))
      })
    });

    orderResult.hidden = false;
    orderResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    showToast("Order placed successfully.");

    if (formData.paymentMethod === "Online Gateway") {
      openGatewayCheckout(formData);
    }

    checkoutForm.reset();
    handlePaymentMethodChange();
    cart.length = 0;
    updateCartUI();
  } catch (error) {
    showToast(error.message);
  }
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = getFormValues(contactForm);

  try {
    await apiFetch("/api/inquiries", {
      method: "POST",
      body: JSON.stringify({
        contactName: formData.contactName,
        contactPhone: formData.contactPhone,
        contactEmail: formData.contactEmail,
        contactMessage: formData.contactMessage
      })
    });

    inquiryResult.hidden = false;
    inquiryResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    contactForm.reset();
    showToast("Inquiry submitted successfully.");
  } catch (error) {
    showToast(error.message);
  }
});

estimatorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = getFormValues(estimatorForm);
  const estimate = calculateHomeEstimate(formData);

  estimateTotal.textContent = formatCurrency(estimate.totalCost);
  estimateRate.textContent = `${formatCurrency(estimate.finalRate)} / sq ft`;
  estimateArea.textContent = `${estimate.totalBuiltArea.toLocaleString("en-IN")} sq ft`;
  estimateMaterials.textContent = formatCurrency(estimate.materialBudget);
  estimatorResult.hidden = false;
  estimatorResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  showToast("Home cost estimate calculated.");
});

document.getElementById("resetEstimatorButton").addEventListener("click", () => {
  estimatorResult.hidden = true;
});

async function init() {
  try {
    const storefront = await apiFetch("/api/storefront", { headers: {} });
    products = storefront.products.map((product) => ({
      ...product,
      price: Number(product.price)
    }));
    renderProducts();
    renderDailyRates(storefront.rates);
    updateCartUI();
    handlePaymentMethodChange();
  } catch (error) {
    showToast("Could not load website data.");
  }
}

init();
