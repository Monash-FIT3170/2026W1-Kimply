import { useState } from "react";
import "./Todo.css";


function TodoInput({ addTodo }) {
  const [text, setText] = useState("");


  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    addTodo(text);
    setText("");
  };


  return (
    <form onSubmit={handleSubmit} className="input-container">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter a task..."
      />
      <button type="submit">Add</button>
    </form>
  );
}
export default TodoInput;
