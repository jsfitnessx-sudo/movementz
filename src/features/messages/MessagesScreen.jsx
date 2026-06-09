import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendPhonePushToUser } from "../../lib/pushNotifications.js";
import { supabase } from "../../lib/supabase/client.js";

function formatMessageTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function peerInitial(peer) {
  return (peer?.peer_name || peer?.peer_email || "M").slice(0, 1).toUpperCase();
}

function relationshipCopy(thread, role) {
  if (!thread) return "Messages";
  if (thread.relationship_role === "mutual") return "Mutual";
  if (thread.relationship_role === "coach") return "Your coach";
  if (thread.relationship_role === "client") return "Client";
  return role === "coach" ? "Client" : "Thread";
}

export function MessagesScreen({ onNotificationsChange, role = "normal_user", user }) {
  const [threads, setThreads] = useState([]);
  const [selectedPeerId, setSelectedPeerId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(Boolean(supabase));
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const threadEndRef = useRef(null);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.peer_id === selectedPeerId),
    [selectedPeerId, threads]
  );

  const loadThreads = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setThreads([]);
      setLoadingThreads(false);
      return;
    }

    setLoadingThreads(true);
    setMessage("");

    const { data, error } = await supabase.rpc("get_my_message_threads");

    setLoadingThreads(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-25-notifications-mutual-messages.sql in Supabase.`);
      setThreads([]);
      return;
    }

    const nextThreads = data || [];
    setThreads(nextThreads);
    setSelectedPeerId((current) => {
      if (current && nextThreads.some((thread) => thread.peer_id === current)) return current;
      return nextThreads[0]?.peer_id || "";
    });
  }, [user.id]);

  const loadMessages = useCallback(async (peerId) => {
    if (!peerId || !supabase || user.id === "demo-user") {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    setMessage("");

    const { data, error } = await supabase.rpc("get_coaching_messages", {
      target_peer_id: peerId
    });

    setLoadingMessages(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-25-notifications-mutual-messages.sql in Supabase.`);
      setMessages([]);
      return;
    }

    setMessages(data || []);
    onNotificationsChange?.({ silent: true });
  }, [onNotificationsChange, user.id]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) loadThreads();
    });
    return () => {
      alive = false;
    };
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedPeerId) return undefined;
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) loadMessages(selectedPeerId);
    });
    return () => {
      alive = false;
    };
  }, [loadMessages, selectedPeerId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, selectedPeerId]);

  async function sendMessage(event) {
    event.preventDefault();
    const cleanDraft = draft.trim();
    if (!cleanDraft || !selectedPeerId || !supabase || user.id === "demo-user") return;

    setSending(true);
    setMessage("");

    const { error } = await supabase.rpc("send_coaching_message", {
      target_peer_id: selectedPeerId,
      message_body: cleanDraft
    });

    setSending(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-25-notifications-mutual-messages.sql in Supabase.`);
      return;
    }

    setDraft("");
    await Promise.all([loadMessages(selectedPeerId), loadThreads()]);
    onNotificationsChange?.({ silent: true });

    sendPhonePushToUser({
      recipientId: selectedPeerId,
      title: `${user.name || "Movementz"} sent you a message`,
      body: cleanDraft,
      url: "/?tab=messages",
      type: "message"
    }).catch((pushError) => {
      console.warn("Phone push failed", pushError);
    });
  }

  const hasThreadPicker = role === "coach" || threads.length > 1 || threads.some((thread) => thread.relationship_role === "mutual");
  const emptyThreadCopy = role === "coach"
    ? "Link a client first, then their thread will appear here."
    : "Accept a coach invite or mutual request and your thread will appear here.";
  const selectedLabel = relationshipCopy(selectedThread, role);

  return (
    <section className="screen-stack messages-screen">
      <div className="screen-heading">
        <p className="eyebrow">Messages</p>
        <h1>Messages</h1>
        <p>{role === "coach" ? "Select a client or mutual and keep the thread in one place." : "Message your coach or approved mutuals."}</p>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}
      {loadingThreads ? <p className="form-message success">Loading messages...</p> : null}

      <div className="message-shell">
        {hasThreadPicker ? (
          <label className="message-client-select">
            Conversation
            <select value={selectedPeerId} onChange={(event) => setSelectedPeerId(event.target.value)}>
              {threads.length ? null : <option value="">No threads yet</option>}
              {threads.map((thread) => (
                <option key={thread.peer_id} value={thread.peer_id}>
                  {thread.peer_name} ({relationshipCopy(thread, role)})
                  {thread.latest_at ? ` - last ${formatMessageTime(thread.latest_at)}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {selectedThread ? (
          <div className="message-thread-head">
            <div className="message-avatar">
              {selectedThread.peer_avatar_url ? (
                <img alt="" src={selectedThread.peer_avatar_url} />
              ) : (
                peerInitial(selectedThread)
              )}
            </div>
            <div>
              <p className="eyebrow">{selectedLabel}</p>
              <h2>{selectedThread.peer_name}</h2>
              <span>{selectedThread.peer_email}</span>
            </div>
          </div>
        ) : null}

        <div className="message-thread-window" aria-live="polite">
          {loadingMessages ? <p className="compact-help">Loading thread...</p> : null}
          {!loadingMessages && !selectedThread ? (
            <p className="compact-help">{emptyThreadCopy}</p>
          ) : null}
          {!loadingMessages && selectedThread && !messages.length ? (
            <p className="compact-help">No messages yet. Start the conversation below.</p>
          ) : null}
          {messages.map((item) => {
            const isMine = item.sender_id === user.id;
            return (
              <article className={isMine ? "message-bubble mine" : "message-bubble"} key={item.id}>
                <p>{item.body}</p>
                <span>{isMine ? "You" : selectedThread?.peer_name || "Coach"} - {formatMessageTime(item.created_at)}</span>
              </article>
            );
          })}
          <div ref={threadEndRef} />
        </div>

        <form className="message-composer" onSubmit={sendMessage}>
          <textarea
            disabled={!selectedThread || sending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={selectedThread?.relationship_role === "mutual" ? "Write your mutual a message..." : role === "coach" ? "Write a check-in, cue, or reminder..." : "Write a message..."}
            value={draft}
          />
          <button className="primary-action filled" disabled={!draft.trim() || !selectedThread || sending} type="submit">
            {sending ? "Sending..." : "Send Message"}
          </button>
        </form>
      </div>
    </section>
  );
}
