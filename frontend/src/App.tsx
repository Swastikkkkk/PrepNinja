import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import InterviewFlow from "./InterviewFlow";
import InterviewSetup from "./InterviewSetup";
import Interview from "./Interview";
import InterviewSet from "./InterviewSet";
import HomePage from "./HomePage";
import ATSChecker from "./ATSChecker";
import Dashboard from "./Dashboard";


export default function App() {
  const API_BASE = "http://localhost:8080";
  const ADMIN_TOKEN = ""; // Leave empty or add your backend admin token


  return (
    <BrowserRouter>
      <Routes>
        {/* Home Page */}
        <Route path="/" element={<HomePage />} />
        
        {/* Interview Routes */}
        <Route path="/interview-flow" element={<InterviewFlow apiBase={API_BASE} />} />
        <Route path="/interview-set" element={<InterviewSet />} />
        
        {/* Skill Scoring Engine dashboard */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* ATS Checker Route */}
        <Route path="/ats-checker" element={<ATSChecker />} />
        
        {/* Admin and Legacy Routes */}
        <Route path="/admin" element={<InterviewSetup apiBase={API_BASE} adminToken={ADMIN_TOKEN} />} />
        <Route path="/interview" element={<Interview />} />
        
        {/* Redirect unknown routes to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
