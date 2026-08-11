// ============================================================
// DENZGAINS PRO FRONTEND
// ============================================================

const API_URL =
  "https://YOUR-WORKER.workers.dev";

const MINIMUM_KES = 10;

let selectedPlatform = "instagram";
let selectedService = null;


// ============================================================
// START
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {
    initializePlatformTabs();
    initializeCalculator();
    initializeQuickOrder();
    initializeOrderTracker();
  }
);


// ============================================================
// PLATFORM TABS
// ============================================================

function initializePlatformTabs() {
  const tabs =
    document.querySelectorAll(
      ".platform-tab"
    );

  tabs.forEach(tab => {
    tab.addEventListener(
      "click",
      () => {

        tabs.forEach(
          item =>
            item.classList.remove(
              "active"
            )
        );

        tab.classList.add("active");

        selectedPlatform =
          tab.dataset.platform;

        populateServices();
      }
    );
  });
}


// ============================================================
// CALCULATOR
// ============================================================

function initializeCalculator() {
  const serviceSelect =
    document.getElementById(
      "calc-service-select"
    );

  if (!serviceSelect) {
    return;
  }

  populateServices();

  serviceSelect.addEventListener(
    "change",
    () => {

      const id =
        serviceSelect.value;

      selectedService =
        SERVICES_DATA.find(
          service =>
            String(service.id) ===
            String(id)
        );

      updateQuantityLimits();
      updateCalculatorPrice();
    }
  );

  const quantity =
    document.getElementById(
      "calc-quantity-input"
    );

  const slider =
    document.getElementById(
      "calc-quantity-slider"
    );

  if (quantity) {
    quantity.addEventListener(
      "input",
      () => {
        if (slider) {
          slider.value =
            quantity.value;
        }

        updateCalculatorPrice();
      }
    );
  }

  if (slider) {
    slider.addEventListener(
      "input",
      () => {

        if (quantity) {
          quantity.value =
            slider.value;
        }

        updateCalculatorPrice();
      }
    );
  }

  const orderButton =
    document.getElementById(
      "btn-calc-order"
    );

  if (orderButton) {
    orderButton.addEventListener(
      "click",
      startPayment
    );
  }
}


// ============================================================
// POPULATE SERVICES
// ============================================================

function populateServices() {
  const select =
    document.getElementById(
      "calc-service-select"
    );

  if (!select) {
    return;
  }

  const services =
    SERVICES_DATA.filter(
      service =>
        service.platform ===
        selectedPlatform
    );

  select.innerHTML = "";

  services.forEach(
    service => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        service.id;

      option.textContent =
        `${service.name} — KES ${service.pricePer1K} / 1K`;

      select.appendChild(
        option
      );
    }
  );

  selectedService =
    services[0] || null;

  updateQuantityLimits();
  updateCalculatorPrice();
}


// ============================================================
// QUANTITY
// ============================================================

function updateQuantityLimits() {
  if (!selectedService) {
    return;
  }

  const input =
    document.getElementById(
      "calc-quantity-input"
    );

  const slider =
    document.getElementById(
      "calc-quantity-slider"
    );

  if (input) {
    input.min =
      selectedService.min;

    input.max =
      selectedService.max;

    input.value =
      selectedService.min;
  }

  if (slider) {
    slider.min =
      selectedService.min;

    slider.max =
      selectedService.max;

    slider.value =
      selectedService.min;
  }

  const minLabel =
    document.getElementById(
      "lbl-min-qty"
    );

  const maxLabel =
    document.getElementById(
      "lbl-max-qty"
    );

  if (minLabel) {
    minLabel.textContent =
      `Min: ${selectedService.min.toLocaleString()}`;
  }

  if (maxLabel) {
    maxLabel.textContent =
      `Max: ${selectedService.max.toLocaleString()}`;
  }
}


// ============================================================
// PRICE
// ============================================================

function calculateFrontendPrice(
  pricePer1K,
  quantity
) {
  const value =
    (pricePer1K / 1000) *
    quantity;

  return Math.max(
    Math.ceil(value * 100) / 100,
    MINIMUM_KES
  );
}


function updateCalculatorPrice() {
  if (!selectedService) {
    return;
  }

  const input =
    document.getElementById(
      "calc-quantity-input"
    );

  const quantity =
    Number(input?.value || 0);

  const price =
    calculateFrontendPrice(
      selectedService.pricePer1K,
      quantity
    );

  const display =
    document.getElementById(
      "calc-price"
    );

  if (display) {
    display.textContent =
      `KES ${price.toLocaleString(
        "en-KE",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      )}`;
  }
}


// ============================================================
// PAYMENT
// ============================================================

async function startPayment() {
  if (!selectedService) {
    alert(
      "Please select a service."
    );
    return;
  }

  const quantity =
    Number(
      document.getElementById(
        "calc-quantity-input"
      )?.value
    );

  const link =
    document.getElementById(
      "calc-link-input"
    )?.value.trim();

  const firstName =
    document.getElementById(
      "customer-first-name"
    )?.value.trim();

  const lastName =
    document.getElementById(
      "customer-last-name"
    )?.value.trim();

  const email =
    document.getElementById(
      "customer-email"
    )?.value.trim();

  const phone =
    document.getElementById(
      "customer-phone"
    )?.value.trim();

  if (!quantity) {
    alert(
      "Enter a quantity."
    );
    return;
  }

  if (!link) {
    alert(
      "Enter the target link."
    );
    return;
  }

  if (!email) {
    alert(
      "Enter your email."
    );
    return;
  }

  if (!phone) {
    alert(
      "Enter your Kenyan phone number."
    );
    return;
  }

  const button =
    document.getElementById(
      "btn-calc-order"
    );

  if (button) {
    button.disabled = true;
    button.textContent =
      "Creating payment...";
  }

  try {

    const response =
      await fetch(
        `${API_URL}/api/payment/create`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            serviceId:
              selectedService.id,

            quantity,

            link,

            firstName:
              firstName || "Customer",

            lastName:
              lastName || "",

            email,

            phone
          })
        }
      );

    const result =
      await response.json();

    if (!response.ok ||
        !result.success) {

      throw new Error(
        result.error ||
        "Unable to create payment."
      );
    }

    window.location.href =
      result.redirect_url;

  } catch (error) {

    alert(
      error.message
    );

    if (button) {
      button.disabled = false;
      button.textContent =
        "Pay with PesaPal";
    }
  }
}


// ============================================================
// QUICK ORDER
// ============================================================

function initializeQuickOrder() {
  const button =
    document.getElementById(
      "btn-quick-order"
    );

  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    startPayment
  );
}


// ============================================================
// ORDER TRACKER
// ============================================================

function initializeOrderTracker() {
  const form =
    document.getElementById(
      "order-tracker-form"
    );

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const reference =
        document.getElementById(
          "order-reference"
        )?.value.trim();

      if (!reference) {
        return;
      }

      try {

        const response =
          await fetch(
            `${API_URL}/api/order?reference=${encodeURIComponent(reference)}`
          );

        const result =
          await response.json();

        if (!result.success) {
          throw new Error(
            result.error ||
            "Order not found"
          );
        }

        displayOrder(
          result.order
        );

      } catch (error) {

        alert(
          error.message
        );
      }
    }
  );
}


function displayOrder(order) {
  const box =
    document.getElementById(
      "order-result"
    );

  if (!box) {
    return;
  }

  box.innerHTML = `
    <h3>Order Status</h3>

    <p>
      <strong>Reference:</strong>
      ${escapeHtml(
        order.merchant_reference
      )}
    </p>

    <p>
      <strong>Service:</strong>
      ${escapeHtml(
        order.service_name
      )}
    </p>

    <p>
      <strong>Quantity:</strong>
      ${Number(
        order.quantity
      ).toLocaleString()}
    </p>

    <p>
      <strong>Amount:</strong>
      KES ${Number(
        order.amount
      ).toFixed(2)}
    </p>

    <p>
      <strong>Status:</strong>
      ${escapeHtml(
        order.status
      )}
    </p>
  `;
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
    }
