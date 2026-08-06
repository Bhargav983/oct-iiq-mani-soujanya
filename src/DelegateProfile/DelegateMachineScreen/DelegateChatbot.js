import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./DelagateChatbot.css";
import DelegateNavbar from "../DelegateNavbar/DelegateNavbar";

const AI_BACKEND_BASE_URL = process.env.REACT_APP_AI_BACKEND_URL || "http://localhost:5001";
const AI_CHAT_ENDPOINT = `${AI_BACKEND_BASE_URL}/ai/chat`;
const AI_HEALTH_ENDPOINT = `${AI_BACKEND_BASE_URL}/health`;


const formatSourceText = (text) => {
  if (!text || typeof text !== "string") return text;
  
  return text
    // 1. Remove internal AnythingLLM metadata tags
    .replace(/<document_metadata>[\s\S]*?<\/document_metadata>/gi, "")
    // 2. Convert inline solid bullets (●) into clean line breaks
    .replace(/\s*●\s*/g, "\n• ")
    // 3. Convert inline hollow sub-bullets (○) into indented line breaks
    .replace(/\s*○\s*/g, "\n  - ")
    .trim();
};

const Chatbot = () => {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("octane_ai_chat_messages");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved chat messages:", e);
      }
    }
    return [
      {
        id: "welcome",
        role: "assistant",
        text: "Hi, I can help with service requests, complaints, machine temperature, and request status.",
      },
    ];
  });

  // Automatically save messages to localStorage whenever the history updates
  useEffect(() => {
    localStorage.setItem("octane_ai_chat_messages", JSON.stringify(messages));
  }, [messages]);
  
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [serviceStatus, setServiceStatus] = useState("checking");
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem("octane_ai_session_id");
    if (existing) return existing;

    const next = `octane-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("octane_ai_session_id", next);
    return next;
  });
  
  const scrollRef = useRef(null);
  
  // Dev-Only Clear Chat Handler (Resets messages and clears localStorage)
  const handleClearChat = () => {
    const defaultWelcome = [
      {
        id: "welcome",
        role: "assistant",
        text: "Hi, I can help with service requests, complaints, machine temperature, and request status.",
      },
    ];
    setMessages(defaultWelcome);
    localStorage.setItem("octane_ai_chat_messages", JSON.stringify(defaultWelcome));
  };
  const userContext = useMemo(() => {
    const context = {};
    Object.keys(localStorage).forEach((key) => {
      const lowerKey = key.toLowerCase();
      if (!lowerKey.includes("user") && !lowerKey.includes("customer") && !lowerKey.includes("company") && !lowerKey.includes("delegate")) {
        return;
      }

      try {
        context[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        context[key] = localStorage.getItem(key);
      }
    });

    const user = context.user || context.customer || context.customerData || context.delegate || {};
    return {
      ...context,
      user,
      user_id: user.customer_id || user.delegate_id || user.user_id || context.user_id,
      company_id: user.company_id || user.company || context.company_id,
      customer_id: user.customer_id || context.customer_id,
      delegate_id: user.delegate_id || context.delegate_id,
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      try {
        const response = await fetch(AI_HEALTH_ENDPOINT, { method: "GET" });
        if (!isMounted) return;
        setServiceStatus(response.ok ? "online" : "offline");
      } catch {
        if (!isMounted) return;
        setServiceStatus("offline");
      }
    };

    checkHealth();
    const intervalId = setInterval(checkHealth, 30000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const sendMessage = async (event) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsLoading(true);

    if (serviceStatus === "offline") {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: "AI service is currently unavailable. Please try again shortly.",
          isError: true,
        },
      ]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(AI_CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          message: text,
          sessionId,
          context: userContext,
        }),
      });

      const data = await response.json().catch(() => ({}));

      // Determine if response is an error (HTTP status check OR backend reported error)
      const isErrorState = !response.ok || data.success === false || data.isError === true;
      
     // Use backend's sanitized error message if error, otherwise use assistant text
    const botText = isErrorState
      ? (data.error || data.message || "An unexpected error occurred. Please try again.")
      : (data.message || data.response || "I could not get a response right now.");

      const citations = data.citations || [];
      const sources = data.sources || [];
      const metrics = data.metrics || data.raw?.metrics || null;

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: botText,
          citations,
          sources,
          metrics,
          isError: isErrorState,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: "I could not reach the AI service. Please try again in a moment.",
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
  <div
    style={{
      background: "linear-gradient(to bottom, #ebeff3, #fafafa)",
      minHeight: "100vh",
    }}
  >
    <div className="machine-placeholder-content">
      <div
        style={{
          padding: "0px",
          maxWidth: "800px",
          margin: "0 auto",
          position: "relative",
          flex: "1",
        }}
      >
        <main className="chatbot-page">
          <section className="chatbot-shell" aria-label="Octane AI chatbot">
            <header className="chatbot-header">
              <div>
                <h1>Octane AI Assistant</h1>
                <p>
                  Service requests, complaints, machine status, and
                  temperatures
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                {process.env.NODE_ENV !== "production" && (
                  <button
                    type="button"
                    onClick={handleClearChat}
                    className="clear-chat-pill"
                  >
                    Clear Chat
                  </button>
                )}

                <span className={`chatbot-status ${serviceStatus}`}>
                  {serviceStatus === "checking"
                    ? "Checking"
                    : serviceStatus === "online"
                    ? "Online"
                    : "Offline"}
                </span>
              </div>
            </header>

            <div className="chatbot-messages" ref={scrollRef}>
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`chatbot-message ${message.role} ${
                    message.isError ? "error" : ""
                  }`}
                >
                  <div className="chatbot-bubble">
                    {message.role === "assistant" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.text}
                      </ReactMarkdown>
                    ) : (
                      message.text
                    )}
                  </div>

                  {message.citations?.length > 0 && (
                    <details className="chatbot-citations">
                      <summary>
                        View Citations ({message.citations.length})
                      </summary>
                      <ul>
                        {message.citations.map((citation, idx) => (
                          <li key={idx}>{formatSourceText(citation)}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {message.sources?.length > 0 && (
                    <details className="chatbot-sources">
                      <summary>
                        View References ({message.sources.length})
                      </summary>
                      <ul>
                        {message.sources.map((source, idx) => {
                          const title =
                            typeof source === "object"
                              ? source.title || source.name
                              : null;

                          const rawText =
                            typeof source === "object"
                              ? source.text || source.content
                              : source;

                          return (
                            <li key={idx}>
                              {title && (
                                <span className="source-title">
                                  {title}
                                </span>
                              )}
                              <p className="source-body">
                                {formatSourceText(rawText)}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}

                  {message.role === "assistant" &&
                    message.metrics &&
                    !message.isError && (
                      <div className="message-footer">
                        {message.metrics.model && (
                          <span className="footer-tag model">
                            {message.metrics.model}
                          </span>
                        )}

                        {message.metrics.duration && (
                          <span className="footer-tag">
                            {Number(message.metrics.duration).toFixed(1)}s
                          </span>
                        )}

                        {message.metrics.completion_tokens && (
                          <span className="footer-tag">
                            {message.metrics.completion_tokens} tokens
                          </span>
                        )}
                      </div>
                    )}
                </article>
              ))}

              {isLoading && (
                <article className="chatbot-message assistant">
                  <div
                    className="chatbot-bubble loading"
                    aria-label="AI is typing"
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                </article>
              )}
            </div>

            <form className="chatbot-input" onSubmit={sendMessage}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about a machine, request, or complaint..."
                disabled={isLoading}
              />

              <button
                type="submit"
                disabled={!input.trim() || isLoading}
              >
                Send
              </button>
            </form>
          </section>
        </main>
      </div>

      <DelegateNavbar />
    </div>
  </div>
);
};

export default Chatbot;
