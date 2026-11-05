// Firebase wiring: Google sign-in plus session storage under users/{uid}/noSleepSessions.
// The path sits inside the shared project's existing users/{uid}/** rule, so no rules change is needed.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    setDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Persistent cache queues writes made while offline and replays them on reconnect.
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const sessionsCol = () => collection(db, 'users', auth.currentUser.uid, 'noSleepSessions');

export function watchAuth(callback) {
    return onAuthStateChanged(auth, callback);
}

export function signIn() {
    return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutUser() {
    return signOut(auth);
}

export function saveSession(id, data) {
    return setDoc(doc(sessionsCol(), id), { ...data, updatedAt: Date.now() }, { merge: true });
}

export function deleteSession(id) {
    return deleteDoc(doc(sessionsCol(), id));
}

/**
 * Live list of sessions that started in [since, until) (until optional), newest first. Returns the
 * unsubscribe function. Both bounds are on startedAt, the same field as the sort, so no composite
 * index is needed.
 */
export function watchSessions({ since, until }, onRows, onError) {
    const bounds = [where('startedAt', '>=', since)];
    if (until !== undefined) bounds.push(where('startedAt', '<', until));
    const q = query(sessionsCol(), ...bounds, orderBy('startedAt', 'desc'));
    return onSnapshot(
        q,
        (snapshot) => onRows(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
        onError,
    );
}
