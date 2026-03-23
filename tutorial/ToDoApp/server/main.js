import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { TasksCollection } from "../imports/api/collections/TasksCollection";
import "../imports/api/publications/TasksPublications";

const insert_task = (taskText) => {
  TasksCollection.insertAsync({text:taskText});
}



Meteor.startup(async () => {
  if ((await TasksCollection.find().countAsync()) == 0){
    [
      "First Task",
      "Second Task",
      "Third Task"
    ].forEach(insert_task);
  }
});



Meteor.methods({
  about() {
    return `This is a Meteor application running React with React Router. this is a generated id: ${Random.id()}`;
  },
});
