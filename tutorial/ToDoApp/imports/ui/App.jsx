import React from "react";
import { useTracker , useSubscribe } from "meteor/react-meteor-data";
import { TasksCollection } from "../api/collections/TasksCollection";



export const App = () => {

  const isLoading = useSubscribe("tasks");
  const tasks = useTracker(() => TasksCollection.find({}).fetch());


  if (isLoading()){
    return <div>Loading...</div>
  }


  return (
    <div>
      <h1> Welcome to Meteor! </h1>

      <ul>
        {tasks.map((task)=>(
          <h1>{task._id}</h1>
        ))}
      </ul>
    </div>
  )


};
