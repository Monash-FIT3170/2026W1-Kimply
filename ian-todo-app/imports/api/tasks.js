let tasks = [];
let nextID = 1;

export function getTasks() {
    return tasks;
}

export function addTask(text) {
    tasks.push({ id: nextID++, text, completed: false });
}

export function removeTask(id) {
    tasks = tasks.filter(task => task.id !== id);
}

export function setCompleted(id, completed) {
    tasks = tasks.map(task => task.id === id ? {...task, completed } : task)};
