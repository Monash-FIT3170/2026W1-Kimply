import { TasksCollection } from "../collections/TaskCollection";

let nextID = 1;

export function getTasks(){
    return TasksCollection.find().fetch() // Gets all the tasks as array
}

export function addTask(text){
    TasksCollection.insertAsync(
        {
            task_id: nextID++,
            task_name: text,
            completed: false,
        }
    )
}

export function removeTask(id) {
    TasksCollection.removeAsync({task_id:id});
}

export function setCompleted(id, completed) {

    TasksCollection.updateAsync({task_id : id }, { $set: {completed : completed }});

}
