import React, { useState } from "react";

const ChatBotNew = () => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const getMachineData = () => {
    const activeMachineParameters = localStorage.getItem(
      "active_machine_parameters"
    );

    if (!activeMachineParameters) {
      return null;
    }

    try {
      return JSON.parse(activeMachineParameters);
    } catch (error) {
      console.error(
        "Failed to parse active_machine_parameters:",
        error
      );
      return null;
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || loading) return;

    const userMessage = message.trim();

    // Show user message immediately
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: userMessage,
      },
    ]);

    setMessage("");
    setLoading(true);

    try {
      const machineData = getMachineData();

      if (!machineData) {
        throw new Error(
          "No active machine parameters found in localStorage."
        );
      }

      const response = await fetch(
        "http://localhost:5000/api/chatbot",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: userMessage,
            machineData: machineData,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: data.answer,
        },
      ]);
    } catch (error) {
      console.error("Chatbot error:", error);

      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: error.message || "Unable to get response.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.chatContainer}>
        <div style={styles.header}>
          <h2 style={{ margin: 0 }}>Machine Assistant</h2>
          {/* <span style={styles.status}>● Online</span> */}
        </div>

        <div style={styles.chatMessages}>
          {messages.length === 0 && (
            <div style={styles.welcome}>
              <h3>Machine Assistant</h3>

              <p>
                Ask me about the active machine parameters.
              </p>

              <div style={styles.examples}>
                <button
                  onClick={() => setMessage("What is the temperature?")}
                >
                  What is the temperature?
                </button>

                <button
                  onClick={() => setMessage("What is the humidity?")}
                >
                  What is the humidity?
                </button>

                <button
                  onClick={() =>
                    setMessage("Give me the current machine status")
                  }
                >
                  Current machine status
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              style={{
                ...styles.messageRow,
                justifyContent:
                  msg.role === "user"
                    ? "flex-end"
                    : "flex-start",
              }}
            >
              <div
                style={{
                  ...styles.messageBubble,
                  ...(msg.role === "user"
                    ? styles.userBubble
                    : styles.botBubble),
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div style={styles.messageRow}>
              <div
                style={{
                  ...styles.messageBubble,
                  ...styles.botBubble,
                }}
              >
                Thinking...
              </div>
            </div>
          )}
        </div>

        <div style={styles.inputContainer}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the machine..."
            rows={1}
            style={styles.input}
          />

          <button
            onClick={sendMessage}
            disabled={loading || !message.trim()}
            style={styles.sendButton}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fb",
    padding: "30px",
    boxSizing: "border-box",
  },

  chatContainer: {
    maxWidth: "900px",
    height: "calc(100vh - 60px)",
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  },

  header: {
    padding: "18px 24px",
    borderBottom: "1px solid #eee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  status: {
    color: "#16a34a",
    fontSize: "14px",
  },

  chatMessages: {
    flex: 1,
    padding: "25px",
    overflowY: "auto",
  },

  welcome: {
    textAlign: "center",
    marginTop: "100px",
    color: "#555",
  },

  examples: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "20px",
  },

  messageRow: {
    display: "flex",
    marginBottom: "15px",
  },

  messageBubble: {
    maxWidth: "70%",
    padding: "12px 16px",
    borderRadius: "12px",
    lineHeight: "1.5",
    whiteSpace: "pre-wrap",
  },

  userBubble: {
    background: "#2563eb",
    color: "#fff",
    borderBottomRightRadius: "3px",
  },

  botBubble: {
    background: "#f1f3f5",
    color: "#222",
    borderBottomLeftRadius: "3px",
  },

  inputContainer: {
    display: "flex",
    gap: "10px",
    padding: "15px",
    borderTop: "1px solid #eee",
  },

  input: {
    flex: 1,
    resize: "none",
    border: "1px solid #ddd",
    borderRadius: "8px",
    padding: "12px",
    fontSize: "15px",
    outline: "none",
  },

  sendButton: {
    padding: "0 22px",
    border: "none",
    borderRadius: "8px",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    fontSize: "15px",
  },
};

export default ChatBotNew;



// import React from "react";

// const ChatBotNew = () => {
//   const activeMachineParameters = localStorage.getItem(
//     "active_machine_parameters"
//   );

//   let machineData = null;

//   try {
//     machineData = activeMachineParameters
//       ? JSON.parse(activeMachineParameters)
//       : null;
//   } catch (error) {
//     console.error("Failed to parse active_machine_parameters:", error);
//   }

//   return (
//     <div style={{ padding: "20px" }}>
//       <h2>Active Machine Parameters</h2>

//       {!machineData ? (
//         <p>No active machine parameters found.</p>
//       ) : (
//         <div>
//           {Object.entries(machineData).map(([key, value]) => (
//             <div
//               key={key}
//               style={{
//                 display: "flex",
//                 justifyContent: "space-between",
//                 padding: "12px 15px",
//                 marginBottom: "8px",
//                 border: "1px solid #ddd",
//                 borderRadius: "8px",
//               }}
//             >
//               <strong>{key}</strong>

//               <span>
//                 {value === null ? "null" : String(value)}
//               </span>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// };

// export default ChatBotNew;