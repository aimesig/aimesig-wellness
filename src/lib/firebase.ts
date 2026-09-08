// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCvOUe1OMi_txfkt8KZOR6nwjqhsNmSON8",
  authDomain: "aimesig-wellness.firebaseapp.com",
  projectId: "aimesig-wellness",
  storageBucket: "aimesig-wellness.firebasestorage.app",
  messagingSenderId: "699737337508",
  appId: "1:699737337508:web:65519a7977425fe0540031",
  measurementId: "G-Q9P08ZJ407"
};


const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;