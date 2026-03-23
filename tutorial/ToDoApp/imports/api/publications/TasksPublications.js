import { Meteor } from "meteor/meteor";
import { TasksCollection } from "../collections/TasksCollection";

Meteor.publish("tasks", ()=>{
    return TasksCollection.find();
});