import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

export interface FitnessProfile {
  // Personal info
  name: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: "male" | "female" | "other" | "";
  // Body metrics
  heightCm: number | null;
  weightKg: number | null;
  // Goals
  fitnessGoal: "lose_weight" | "gain_muscle" | "maintain" | "improve_endurance" | "general_health" | "";
  targetWeightKg: number | null;
  weeklyWorkoutDays: number | null;
  dailyStepsGoal: number | null;
  dailyWaterLiters: number | null;
  sleepHoursGoal: number | null;
  // Activity level
  activityLevel: "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "extra_active" | "";
  // Health info
  dietaryPreference: "none" | "vegetarian" | "vegan" | "keto" | "paleo" | "mediterranean" | "";
  healthConditions: string[];
  // App preferences
  reminderEnabled: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function getBMICategory(bmi: number): {
  label: string;
  color: string;
  description: string;
} {
  if (bmi < 18.5)
    return { label: "Underweight", color: "#3b82f6", description: "Below healthy range" };
  if (bmi < 25)
    return { label: "Normal weight", color: "#22c55e", description: "Healthy range" };
  if (bmi < 30)
    return { label: "Overweight", color: "#f59e0b", description: "Above healthy range" };
  return { label: "Obese", color: "#ef4444", description: "Significantly above healthy range" };
}

export function calculateAge(dateOfBirth: string): number | null {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function calculateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: string,
): number {
  // Mifflin-St Jeor Equation
  if (gender === "female") {
    return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
}

export function calculateTDEE(bmr: number, activityLevel: string): number {
  const multipliers: Record<string, number> = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extra_active: 1.9,
  };
  return bmr * (multipliers[activityLevel] ?? 1.2);
}

export async function getProfile(userId: string): Promise<FitnessProfile | null> {
  const ref = doc(db, "users", userId, "profile", "data");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as FitnessProfile;
}

export async function saveProfile(
  userId: string,
  profile: FitnessProfile,
): Promise<void> {
  const ref = doc(db, "users", userId, "profile", "data");
  await setDoc(ref, {
    ...profile,
    updatedAt: serverTimestamp(),
    createdAt: profile.createdAt ?? serverTimestamp(),
  });
}
