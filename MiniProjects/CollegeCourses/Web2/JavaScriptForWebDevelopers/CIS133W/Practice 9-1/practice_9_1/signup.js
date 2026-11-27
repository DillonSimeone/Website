const form = document.getElementById("signupForm");
const submitBtn = document.getElementById("submitBtn");

const fields = {
  firstName: document.getElementById("firstName"),
  lastName: document.getElementById("lastName"),
  email: document.getElementById("email"),
  phone: document.getElementById("phone"),
  password: document.getElementById("password"),
  confirmPassword: document.getElementById("confirmPassword"),
  country: document.getElementById("country")
};

const nameRegex = /^[A-Za-z]{2,30}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.edu$/i;
const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;

const validators = {
  firstName: (val) => {
    const v = val.trim();
    if (!v) return "First name is required.";
    if (!nameRegex.test(v)) return "First name must be 2–30 letters only.";
    return "";
  },
  lastName: (val) => {
    const v = val.trim();
    if (!v) return "Last name is required.";
    if (!nameRegex.test(v)) return "Last name must be 2–30 letters only.";
    return "";
  },
  email: (val) => {
    const v = val.trim();
    if (!v) return "Email is required.";
    if (!emailRegex.test(v)) return "Enter a valid .edu email address.";
    return "";
  },
  phone: (val) => {
    const v = val.trim();
    if (v && !phoneRegex.test(v)) return "Phone must match format 555-123-4567.";
    return "";
  },
  password: (val) => {
    if (!val) return "Password is required.";
    if (val.length < 8) return "Password must be at least 8 characters.";
    return "";
  },
  confirmPassword: (val) => {
    if (!val) return "Please confirm your password.";
    if (val !== fields.password.value) return "Passwords do not match.";
    return "";
  },
  country: (val) => {
    if (!val) return "Please select a country.";
    return "";
  }
};

function validateField(name) {
  const message = validators[name](fields[name].value);
  document.getElementById(`err-${name}`).textContent = message;
  return message === "";
}

function isFormValid() {
  return Object.keys(validators).every((name) => validators[name](fields[name].value) === "");
}

function updateSubmitState() {
  submitBtn.disabled = !isFormValid();
}

Object.entries(fields).forEach(([name, el]) => {
  const eventName = el.tagName === "SELECT" ? "change" : "input";
  el.addEventListener(eventName, () => {
    validateField(name);
    if (name === "password" && fields.confirmPassword.value !== "") {
      validateField("confirmPassword");
    }
    updateSubmitState();
  });
});

form.addEventListener("submit", (e) => {
  e.preventDefault();

  let firstInvalid = null;
  for (const name of Object.keys(validators)) {
    const valid = validateField(name);
    if (!valid && !firstInvalid) {
      firstInvalid = fields[name];
    }
  }

  if (firstInvalid) {
    firstInvalid.focus();
    updateSubmitState();
    return;
  }

  alert("Thank you, check your inbox.");
  form.reset();
  Object.keys(validators).forEach((name) => {
    document.getElementById(`err-${name}`).textContent = "";
  });
  submitBtn.disabled = true;
});
