import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Socket } from "socket.io-client";
import { Audience3D } from "./Audience3D";
import { AudienceState } from "../../../server/audience";
import "./preview.css";

class PreviewSocket {
  connected = true;
  listeners = new Map<string, Set<(...args: any[]) => void>>();
  state = new AudienceState();
  constructor() {
    for (const id of ["luna", "you", "oliver", "mia"]) this.state.join(id);
    setInterval(() => {
      if (this.state.tick(Date.now())) this.receive("REC:audience", this.state.snapshot());
    }, 50);
  }
  on(event: string, handler: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }
  off(event: string, handler: (...args: any[]) => void) { this.listeners.get(event)?.delete(handler); }
  receive(event: string, data?: any) { this.listeners.get(event)?.forEach((handler) => handler(data)); }
  emit(event: string, data?: any) {
    if (!this.connected) return;
    if (event === "CMD:audienceSync") this.receive("REC:audience", this.state.snapshot());
    if (event === "CMD:audienceMove") this.state.move("you", data);
    if (event === "CMD:audienceStop") this.state.stop("you");
    if (event === "CMD:audienceColor") {
      const update = this.state.color("you", data);
      if (update) this.receive("REC:audienceMove", update);
    }
    if (event === "CMD:audienceExpression") {
      const update = this.state.expression("you", data);
      if (update) this.receive("REC:audienceMove", update);
    }
    if (event === "CMD:audienceGesture") {
      const update = this.state.gesture("you", data);
      if (update) this.receive("REC:audienceMove", update);
    }
  }
}
const socket = new PreviewSocket();
function Preview() {
  const [participants, setParticipants] = useState([
    { id: "luna" },
    { id: "you" },
    { id: "oliver" },
    { id: "mia" },
  ]);
  const [chat, setChat] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  function send() {
    if (!chat.trim()) return;
    socket.receive("REC:chat", {
      id: "you",
      msg: chat,
      timestamp: new Date().toISOString(),
    });
    setSent((previous) => [...previous, chat]);
    setChat("");
  }
  return (
    <main>
      <header>
        <a className="brand" href="#">
          ◉ <span>watchparty</span>
        </a>
        <nav>
          Movie night <span className="live-pill">● &nbsp; LIVE ROOM</span>
        </nav>
        <button>↗ &nbsp; Invite friends</button>
      </header>
      <div className="room-title">
        <div>
          <span className="eyebrow">THE GOOD KIND OF TOGETHER</span>
          <h1>A little closer, from anywhere.</h1>
        </div>
        <span className="status">● &nbsp; Everyone’s in sync</span>
      </div>
      <div className="room-grid">
        <div className="watch-column">
          <div className="video-frame">
            <div className="sky">
              <div className="moon" />
              <div className="mountain one" />
              <div className="mountain two" />
              <div className="mountain three" />
              <div className="film-title">
                <span>Tonight’s escape</span>
                <h2>Somewhere, together.</h2>
              </div>
            </div>
            <div className="video-control">
              <span>Ⅱ &nbsp; ◖))</span>
              <div className="timeline">
                <i />
              </div>
              <span>
                24:18 <em>/ 1:42:06</em> &nbsp; ⛶
              </span>
            </div>
          </div>
          <Audience3D
            socket={socket as unknown as Socket}
            participants={participants}
            nameMap={{
              luna: "Luna",
              you: "You",
              oliver: "Oliver",
              mia: "Mia",
              finn: "Finn",
            }}
            clientId="you"
            isChatDisabled={disabled}
          />
          <p className="study-note">
            Three.js slime room · Pick your color, bounce around, and gently
            nudge idle friends in a double-width cozy lounge.
          </p>
        </div>
        <aside>
          <div className="chat-heading">
            Room chat <span>4 here</span>
          </div>
          <div className="messages">
            <div className="message">
              <b className="luna">Luna</b>
              <small>8:42 PM</small>
              <p>This is exactly the kind of night I needed</p>
            </div>
            <div className="message">
              <b className="oliver">Oliver</b>
              <small>8:43 PM</small>
              <p>Blanket? Check. Snacks? Check. 🍿</p>
            </div>
            <div className="message">
              <b className="mia">Mia</b>
              <small>8:44 PM</small>
              <p>Okay, this view is beautiful.</p>
            </div>
            {sent.map((message, index) => (
              <div className="message" key={index}>
                <b className="you">You</b>
                <small>just now</small>
                <p>{message}</p>
              </div>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              aria-label="Message the room"
              placeholder="Say something nice…"
              value={chat}
              onChange={(event) => setChat(event.target.value)}
            />
            <button aria-label="Send message" type="submit">
              ↑
            </button>
          </form>
          <p className="chat-note">Good company makes the movie.</p>
        </aside>
      </div>
      <details>
        <summary>Interaction checks</summary>
        <div className="checks">
          <button
            onClick={() =>
              socket.receive("REC:chat", {
                id: "luna",
                msg: "I saved you a spot ♡",
                timestamp: new Date().toISOString(),
              })
            }
          >
            Show friend’s live bubble
          </button>
          <button
            onClick={() =>
              setParticipants((previous) =>
                previous.some((person) => person.id === "finn")
                  ? previous.filter((person) => person.id !== "finn")
                  : [...previous, { id: "finn" }],
              )
            }
          >
            Join / leave
          </button>
          <button
            onClick={() => {
              socket.connected = !socket.connected;
              socket.receive(socket.connected ? "connect" : "disconnect");
            }}
          >
            Disconnect / reconnect
          </button>
          <button onClick={() => setDisabled((previous) => !previous)}>
            Toggle chat moderation
          </button>
        </div>
        <p>
          This fixture uses an in-memory Socket.IO-shaped event source.
          Production uses the room’s existing connection and
          server-authoritative positions.
        </p>
      </details>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
