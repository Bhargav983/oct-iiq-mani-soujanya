import React, { createContext, useState, useEffect } from "react";

export const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("user");
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const [sessionId, setSessionId] = useState(
    localStorage.getItem("session_id") || null
  ); // ✅ NEW

  useEffect(() => {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    }
  }, [user]);

  const login = (userData) => {
    setUser(userData);

    // ✅ store session_id from userData
    if (userData?.session_id) {
      localStorage.setItem("session_id", userData.session_id);
      setSessionId(userData.session_id);
    }
  };

  const logout = () => {
    setUser(null);
    setSessionId(null);

    // ❗ better than clear()
    localStorage.removeItem("user");
    localStorage.removeItem("userId");
    localStorage.removeItem("userMobile");
    localStorage.removeItem("userName");
    localStorage.removeItem("customerType");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("session_id"); // ✅ IMPORTANT
    localStorage.removeItem("selectedService");
  };

  return (
    <AuthContext.Provider value={{ user, sessionId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;