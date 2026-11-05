// Web config for the shared Firebase project (the same one pomalo and our-alarms use). These
// values identify the project and are public by design; access is enforced by the Firestore
// rules (users/{uid}/** readable and writable only by that signed-in user), not by hiding this.
export const firebaseConfig = {
    apiKey: 'AIzaSyCMxWyGRJScXgsl1qa_nNbUdIs5o86w83Y',
    authDomain: 'generic-sirbepy-project.firebaseapp.com',
    projectId: 'generic-sirbepy-project',
    storageBucket: 'generic-sirbepy-project.firebasestorage.app',
    messagingSenderId: '639863367604',
    appId: '1:639863367604:web:c706f3353dd9d6f819f4e1',
};
