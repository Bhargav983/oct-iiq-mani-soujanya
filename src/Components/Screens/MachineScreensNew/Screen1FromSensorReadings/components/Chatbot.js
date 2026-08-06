// Chatbot.jsx
import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import "./Chatbot.css";

// const WEBHOOK_URL = "http://localhost:5678/webhook/hvac-chat-new-version";
// const WEBHOOK_URL = "http://localhost:5678/webhook/hvac-chat";
const WEBHOOK_URL = "https://n8ncustomer.air2o.net/webhook/hvac-chat-test-new-version";

export default function Chatbot() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "Hi 👋 I'm your HVAC Assistant.\n\nAsk me anything about your machines."
    }
  ]);

  const chatBodyRef = useRef(null);
  const customer_id = "05100";
  const company_id = "SA-GA-01";

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!message.trim()) return;

    const userMessage = message;
    setMessages((prev) => [
      ...prev,
      { sender: "user", text: userMessage },
    ]);
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, customer_id, company_id }),
      });

      const data = await response.json();
      const botText = Array.isArray(data)
        ? data[0]?.text
        : (data.reply || data.message || data.text);

      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: botText || "No response received." },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "Unable to contact chatbot." },
      ]);
    }
    setLoading(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="header-content">
          <div className="header-icon">❄️</div>
          <div>
            <div className="header-title">HVAC AI Assistant</div>
            <div className="header-status">● Online</div>
          </div>
        </div>
      </div>

      <div className="chat-body" ref={chatBodyRef}>
        {messages.map((item, index) => (
          <div
            key={index}
            className={`message-wrapper ${item.sender === "user" ? "user-wrapper" : "bot-wrapper"}`}
          >
            <div className={`message ${item.sender === "user" ? "user-message" : "bot-message"}`}>
              <ReactMarkdown>{item.text || ""}</ReactMarkdown>
            </div>
            <div className={`message-time ${item.sender === "user" ? "user-time" : "bot-time"}`}>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message-wrapper bot-wrapper">
            <div className="message bot-message typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </div>

      <div className="chat-footer">
        <div className="input-wrapper">
          <textarea
            placeholder="Ask something..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={onKeyDown}
            rows="1"
            className="chat-input"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !message.trim()}
            className="send-button"
          >
            {loading ? '⏳' : '➤'}
          </button>
        </div>
        <div className="footer-info">
          <span className="dot"></span> AI-powered support
        </div>
      </div>
    </div>
  );
}