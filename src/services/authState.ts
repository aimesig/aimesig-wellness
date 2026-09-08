import {
  onAuthStateChanged,
  type Unsubscribe,
  type User,
} from "firebase/auth";

import { auth } from "../lib/firebase";

export function subscribeToAuthState(
  callback: (user: User | null) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}