'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient, User } from '@supabase/supabase-js';

// --- Supabase Client Setup ---
// உங்கள் .env.local கோப்பில் இருந்து மதிப்புகளைப் பெறுகிறது
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Message type definition
type Message = {
  role: 'user' | 'model';
  content: string; // 'text' என்பதை 'content' ஆக மாற்றியுள்ளோம்
};

// --- Authentication Component ---
const AuthForm = ({ isLogin, switchForm }: { isLogin: boolean, switchForm: () => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Signup successful! Please login.');
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white font-sans">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-2xl shadow-lg">
        <h1 className="text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
          {isLogin ? 'Welcome Back!' : 'Join Arun Chat Bot'}
        </h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 bg-gray-700 rounded-lg border-0 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition" />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 bg-gray-700 rounded-lg border-0 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition" />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading} className="w-full px-6 py-3 text-lg font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 transition">
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <p className="text-center text-gray-400">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={switchForm} className="font-semibold text-cyan-400 hover:text-cyan-300">{isLogin ? 'Sign Up' : 'Login'}</button>
        </p>
      </div>
    </div>
  );
};

// --- Chat Page Component ---
const ChatPage = ({ user }: { user: User }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // பழைய உரையாடல்களை Supabase-இல் இருந்து எடுக்கும் செயல்பாடு
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('role, content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else if (data.length === 0) {
        setMessages([{ role: 'model', content: `Welcome, ${user.email}! Ask me anything.` }]);
      } else {
        setMessages(data as Message[]);
      }
    };
    fetchMessages();
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };
  
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);

    // பயனர் செய்தியை Supabase-இல் சேமித்தல்
    await supabase.from('messages').insert({ user_id: user.id, role: 'user', content: input });

    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: [...messages, userMessage] }),
      });
      if (!response.ok) throw new Error(await response.text());
      if (!response.body) throw new Error('No response body');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let botResponse = '';
      setMessages((prev) => [...prev, { role: 'model', content: '' }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        botResponse += decoder.decode(value, { stream: true });
        setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1].content = botResponse;
            return updated;
        });
      }
      // பாட் பதிலை Supabase-இல் சேமித்தல்
      await supabase.from('messages').insert({ user_id: user.id, role: 'model', content: botResponse });

    } catch (error: any) {
      const errorMessage = error.message.includes('Error from Gemini API:') ? error.message : 'Sorry, an unexpected error occurred.';
      setMessages((prev) => [...prev, { role: 'model', content: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
      <header className="p-4 border-b border-gray-700 shadow-lg flex justify-between items-center">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">Arun Chat Bot</h1>
        <button onClick={handleLogout} className="px-4 py-2 text-sm bg-red-500 rounded-lg hover:bg-red-600 transition">Logout</button>
      </header>
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (<div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-600 to-blue-500 flex items-center justify-center font-bold text-lg flex-shrink-0">A</div>)}
            <div className={`max-w-lg p-4 rounded-2xl shadow-md ${msg.role === 'user' ? 'bg-blue-600 rounded-br-none' : 'bg-gray-700 rounded-bl-none'}`}><p className="whitespace-pre-wrap">{msg.content}</p></div>
            {msg.role === 'user' && (<div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center font-bold text-lg flex-shrink-0">{user.email ? user.email.charAt(0).toUpperCase() : 'U'}</div>)}
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && ( <div className="flex items-start gap-4 justify-start"> <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-600 to-blue-500 flex items-center justify-center font-bold text-lg flex-shrink-0">A</div> <div className="max-w-lg p-4 rounded-2xl shadow-md bg-gray-700 rounded-bl-none flex items-center space-x-2"> <span className="h-2 w-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></span> <span className="h-2 w-2 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></span> <span className="h-2 w-2 bg-white rounded-full animate-bounce"></span> </div> </div>)}
        <div ref={chatEndRef} />
      </main>
      <footer className="p-4 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center max-w-3xl mx-auto">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()} placeholder="Ask Arun anything..." className="flex-1 p-3 bg-gray-700 rounded-l-lg border-0 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition" disabled={isLoading} />
          <button onClick={handleSend} disabled={isLoading} className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-r-lg hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"> <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> </button>
        </div>
      </footer>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const [session, setSession] = useState<User | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [loading, setLoading] = useState(true); // కొత్తது: session load ஆவதை கண்காணிக்க

  useEffect(() => {
    const getSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session?.user ?? null);
        setLoading(false); // Session load ஆகிவிட்டது
    }
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Session load ஆகும் வரை loading காட்சியைக் காட்டு
  if (loading) {
    return (
        <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
            <p>Loading...</p>
        </div>
    );
  }

  if (!session) {
    return <AuthForm isLogin={isLoginView} switchForm={() => setIsLoginView(!isLoginView)} />;
  }

  return <ChatPage user={session} />;
}
