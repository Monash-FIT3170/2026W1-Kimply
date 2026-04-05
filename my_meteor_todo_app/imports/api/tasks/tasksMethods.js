import { Meteor } from 'meteor/meteor';
import { getTasks, addTask, removeTask, setCompleted } from './tasks';

Meteor.methods({
    'tasks.get'() {
        return getTasks();
    },

    'tasks.add'(text) {
        addTask(text);
    },

    'tasks.remove'(id) {
        removeTask(id);
    },

    'tasks.setCompleted'(id, completed) {
        setCompleted(id, completed);
    },
});
