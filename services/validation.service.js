export class ValidationService {
  validateSignupData(data) {
    const { firstName, lastName, username, email, password } = data;
    const errors = [];

    if (!firstName?.trim()) errors.push("First name is required");
    if (!lastName?.trim()) errors.push("Last name is required");
    if (!username?.trim()) errors.push("Username is required");
    if (!email?.trim()) errors.push("Email is required");
    if (!password) errors.push("Password is required");

    if (email && !this.isValidEmail(email)) {
      errors.push("Invalid email format");
    }

    if (username && username.length < 3) {
      errors.push("Username must be at least 3 characters");
    }

    if (password && password.length < 8) {
      errors.push("Password must be at least 8 characters");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  validateSigninData(data) {
    const { identifier, password } = data;
    const errors = [];

    if (!identifier?.trim()) errors.push("Email or username is required");
    if (!password) errors.push("Password is required");

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
