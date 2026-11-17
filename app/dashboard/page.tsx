'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import ProgressChart from '@/components/ProgressChart';

export default function StudentDashboard() {
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('free');
  const [progressLogs, setProgressLogs] = useState<any[]>([]);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          router.push('/login');
          return;
        }

        setUserEmail(user.email || null);

        // Fetch subscription status
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', user.id)
          .single();

        if (subData) {
          setSubscriptionStatus(subData.status);
        }

        // Fetch recent progress logs
        const { data: logsData } = await supabase
          .from('progress_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false });

        if (logsData) {
          setProgressLogs(logsData);
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [router, supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2 text-gray-500 text-sm font-medium">
          <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Loading your learning dashboard...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              🇬🇧 B1 British English Platform
            </span>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Student Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">{userEmail}</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 text-xs font-semibold rounded-full uppercase tracking-wide ${
              subscriptionStatus === 'active' 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {subscriptionStatus === 'active' ? '⭐ Premium Member' : '🔒 Free Tier'}
            </span>
            {subscriptionStatus !== 'active' && (
              <button
                onClick={() => router.push('/pricing')}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                Upgrade
              </button>
            )}
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">🗣️ Speaking Lab</h2>
            <p className="text-sm text-gray-600">
              Practice your British pronunciation and conversational flow with instant AI feedback powered by Groq Whisper.
            </p>
            <button
              onClick={() => router.push('/sessions/11111111-1111-1111-1111-000000000001')}
              className="w-full py-2.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors"
            >
              Start Speaking Session
            </button>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">📝 Placement & Review</h2>
            <p className="text-sm text-gray-600">
              Retake your B1 assessment quiz or check your grammar proficiency scores.
            </p>
            <button
              onClick={() => router.push('/onboarding/placement')}
              className="w-full py-2.5 bg-gray-100 text-gray-800 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors"
            >
              Take Placement Quiz
            </button>
          </div>
        </div>

        {/* Analytics & Progress Section */}
        <div className="space-y-6">
          {/* Visual Progress Chart */}
          <ProgressChart logs={progressLogs} />

          {/* Recent Activity Table */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">📊 Recent Progress Logs</h2>
            
            {progressLogs.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                No activity logged yet. Complete a speaking session or placement quiz to see your history!
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {progressLogs.map((log) => (
                  <div key={log.id} className="py-3 flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium text-gray-800 uppercase text-xs tracking-wider">
                        {log.session_id}
                      </span>
                      <p className="text-xs text-gray-400">
                        {new Date(log.completed_at).toLocaleDateString()} at {new Date(log.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="bg-blue-50 text-blue-900 px-3 py-1 rounded-lg text-xs font-bold">
                      Score: {log.score}
                    </div>
                  </div>