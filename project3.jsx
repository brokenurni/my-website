import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, BookOpen, Target, Sparkles, Settings, Volume2, VolumeX, Loader, User } from 'lucide-react';
import PropTypes from 'prop-types';
import { debounce } from 'lodash';
import { differenceInYears, differenceInMonths, differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns';
import { FixedSizeList } from 'react-window';

// Firebase Imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously, signInWithCustomToken, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, doc, setDoc, onSnapshot, setLogLevel } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// Constants
const MESSAGES = [
  "In 2525, none of us will exist. So live kindly.",
  "Every second is a sacred chance.",
  // ... (other messages remain unchanged)
];

const GRATITUDE_PROMPTS = [
  "This problem means you're still alive.",
  // ... (other prompts remain unchanged)
];

const DUTY_EXAMPLES = ["Be kind", "Help family", "Create beauty", "Learn something", "Forgive someone"];
const MEDITATION_AUDIO_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

// TimeStat Component
const TimeStat = ({ title, data, color, showHourlyBreakdown }) => (
  <div className={`bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-${color}-500/20 shadow-inner`} aria-label={`${title} statistics`}>
    <h3 className={`text-${color}-400 text-sm mb-4`}>{title}</h3>
    <div className="space-y-2 text-white">
      <div className="flex justify-between">
        <span className={`text-${color}-300/70`}>Years</span>
        <span className="font-bold">{data?.years ?? '--'}</span>
      </div>
      {/* ... (other time units remain unchanged) */}
      {(showHourlyBreakdown || title.includes('Remaining')) && (
        <>
          <div className="flex justify-between">
            <span className={`text-${color}-300/70`}>Hours</span>
            <span className="font-bold">{data?.hours ?? '--'}</span>
          </div>
          {/* ... (minutes and seconds remain unchanged) */}
        </>
      )}
    </div>
  </div>
);

TimeStat.propTypes = {
  title: PropTypes.string.isRequired,
  data: PropTypes.shape({
    years: PropTypes.number,
    months: PropTypes.number,
    days: PropTypes.number,
    hours: PropTypes.number,
    minutes: PropTypes.number,
    seconds: PropTypes.number,
  }),
  color: PropTypes.string.isRequired,
  showHourlyBreakdown: PropTypes.bool.isRequired,
};

// Virtualized List for Notes
const NoteList = ({ notes }) => (
  <FixedSizeList
    height={400}
    width="100%"
    itemCount={notes.length}
    itemSize={120}
  >
    {({ index, style }) => (
      <div style={style} className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20 shadow-inner">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{notes[index].emoji}</span>
          <span className="text-purple-300/70 text-sm font-mono">{notes[index].date}</span>
        </div>
        <p className="text-white leading-relaxed">{notes[index].text}</p>
      </div>
    )}
  </FixedSizeList>
);

NoteList.propTypes = {
  notes: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      text: PropTypes.string.isRequired,
      type: PropTypes.oneOf(['idea', 'inspired']).isRequired,
      emoji: PropTypes.string.isRequired,
      date: PropTypes.string.isRequired,
    })
  ).isRequired,
};

// Error Boundary
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex flex-col items-center justify-center p-6 text-white font-inter">
          <p className="text-2xl text-red-400">Something went wrong.</p>
          <p className="text-purple-300/70 mt-2">Please refresh the page or contact support.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

export default function Afterus() {
  // State
  const [activeTab, setActiveTab] = useState('clock');
  const [showSetup, setShowSetup] = useState(true);
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('00:00');
  const [lifespan, setLifespan] = useState(80);
  const [showHourlyBreakdown, setShowHourlyBreakdown] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(0);
  const [timeData, setTimeData] = useState(null);
  const [duties, setDuties] = useState([]);
  const [newDuty, setNewDuty] = useState('');
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('idea');
  const [isSoundOn, setIsSoundOn] = useState(false);
  const [showAudioPrompt, setShowAudioPrompt] = useState(false);
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef(null);

  const appId = typeof __app_id !== 'undefined' ? __app_id : 'fallback-app-id';

  // Input Validation
  const isValidBirthDate = birthDate && new Date(birthDate) <= new Date();
  const isValidLifespan = lifespan >= 60 && lifespan <= 120;

  // Debounced Save Function
  const saveUserData = useCallback(
    debounce((updates) => {
      if (!db || !userId || isLoading) return;
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/appData`, 'config');
      setDoc(docRef, updates, { merge: true }).catch(error => {
        console.error("Error saving user data:", error);
      });
    }, 500),
    [db, userId, isLoading, appId]
  );

  // Firebase Initialization
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
        if (!firebaseConfig.apiKey) {
          console.error("Firebase config is missing or invalid.");
          setIsLoading(false);
          return;
        }
        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const auth = getAuth(app);
        setLogLevel('debug');
        await setPersistence(auth, browserLocalPersistence);

        let user;
        if (typeof __initial_auth_token !== 'undefined') {
          await signInWithCustomToken(auth, __initial_auth_token);
          user = auth.currentUser;
        } else {
          const anonUser = await signInAnonymously(auth);
          user = anonUser.user;
        }

        setUserId(user.uid);
        setDb(firestoreDb);

        const docRef = doc(firestoreDb, `artifacts/${appId}/users/${user.uid}/appData`, 'config');
        const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            setName(data.name || '');
            setBirthDate(data.birthDate || '');
            setBirthTime(data.birthTime || '00:00');
            setLifespan(data.lifespan || 80);
            setDuties(data.duties || []);
            setNotes(data.notes || []);
            setShowHourlyBreakdown(data.showHourlyBreakdown ?? false);
            setIsSoundOn(data.isSoundOn ?? false);
            setShowSetup(!(data.name && data.birthDate));
          } else {
            setShowSetup(true);
          }
          setIsLoading(false);
        }, (error) => {
          console.error("Firestore listen error:", error);
          setIsLoading(false);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error("Firebase setup failed:", error);
        setIsLoading(false);
      }
    };
    if (appId) initializeFirebase();
  }, [appId]);

  // Save User Data
  useEffect(() => {
    if (!isLoading && db && userId) {
      saveUserData({ name, birthDate, birthTime, lifespan, showHourlyBreakdown, isSoundOn });
    }
  }, [name, birthDate, birthTime, lifespan, showHourlyBreakdown, isSoundOn, isLoading, db, userId, saveUserData]);

  // Time Calculations
  const calculateTimeData = useCallback(() => {
    if (!birthDate || !isValidBirthDate) return;

    const birthDateTimeString = `${birthDate}T${birthTime || '00:00'}:00`;
    const now = new Date();
    const birth = new Date(birthDateTimeString);
    const endDate = new Date(birth);
    endDate.setFullYear(birth.getFullYear() + lifespan);

    if (isNaN(birth.getTime())) return;

    const calcTime = (start, end) => {
      const years = differenceInYears(end, start);
      const months = differenceInMonths(end, start) % 12;
      const days = differenceInDays(end, start) % 30;
      const hours = differenceInHours(end, start) % 24;
      const minutes = differenceInMinutes(end, start) % 60;
      const seconds = differenceInSeconds(end, start) % 60;
      return { years, months, days, hours, minutes, seconds };
    };

    const totalMs = endDate - birth;
    const livedMs = now - birth;
    const remainingMs = Math.max(0, endDate - now);
    const percentage = Math.min(100, (livedMs / totalMs) * 100).toFixed(4);

    setTimeData({
      lived: calcTime(birth, now),
      remaining: calcTime(now, endDate),
      percentage,
    });
  }, [birthDate, birthTime, lifespan, isValidBirthDate]);

  useEffect(() => {
    if (!birthDate || !isValidBirthDate) return;
    calculateTimeData();
    const interval = setInterval(calculateTimeData, 1000);
    return () => clearInterval(interval);
  }, [birthDate, birthTime, lifespan, calculateTimeData, isValidBirthDate]);

  // Audio Logic
  useEffect(() => {
    const audio = new Audio(MEDITATION_AUDIO_URL);
    audio.loop = true;
    audio.volume = 0.4;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      if (isSoundOn && !showAudioPrompt) {
        audioRef.current.play().catch(() => {
          setShowAudioPrompt(true);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isSoundOn, showAudioPrompt]);

  // Message Rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % MESSAGES.length);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Handlers
  const handleSetup = () => {
    if (name.trim() && birthDate && isValidBirthDate && isValidLifespan) {
      setShowSetup(false);
    }
  };

  const addDuty = () => {
    if (newDuty.trim()) {
      const updatedDuties = [...duties, { text: newDuty, completed: false, id: Date.now() }];
      setDuties(updatedDuties);
      setNewDuty('');
      saveUserData({ duties: updatedDuties });
    }
  };

  const toggleDuty = (id) => {
    const updatedDuties = duties.map(d => d.id === id ? { ...d, completed: !d.completed } : d);
    setDuties(updatedDuties);
    saveUserData({ duties: updatedDuties });
  };

  const addNote = () => {
    if (newNote.trim()) {
      const emoji = noteType === 'idea' ? '💭' : '⚡';
      const updatedNotes = [{ text: newNote, type: noteType, emoji, date: new Date().toLocaleDateString(), id: Date.now() }, ...notes];
      setNotes(updatedNotes); // Fixed typo
      setNewNote('');
      saveUserData({ notes: updatedNotes });
    }
  };

  // Audio Prompt
  const handleAudioPrompt = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.warn("Audio play failed:", e));
      setShowAudioPrompt(false);
    }
  };

  // Render
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex flex-col items-center justify-center p-6 text-white font-inter">
        <Loader className="w-12 h-12 animate-spin text-purple-400" />
        <p className="mt-4 text-purple-300">Loading your journey...</p>
      </div>
    );
  }

  if (showSetup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-6 font-inter">
        <div className="max-w-md w-full bg-black/40 backdrop-blur-lg rounded-3xl p-8 border border-purple-500/20 shadow-2xl">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-amber-400 mb-2 text-center">
            Afterus
          </h1>
          <p className="text-purple-300/70 text-center mb-8 text-sm">Time flows. Make it divine.</p>
          <div className="space-y-6">
            <div>
              <label className="block text-purple-300 mb-2 text-sm flex items-center">
                <User className="w-4 h-4 mr-1" />Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full bg-black/30 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400"
                aria-required="true"
              />
            </div>
            <div>
              <label className="block text-purple-300 mb-2 text-sm">Your Birth Date</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full bg-black/30 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400"
                aria-required="true"
              />
              {!isValidBirthDate && birthDate && (
                <p className="text-red-400 text-sm mt-1">Birth date cannot be in the future.</p>
              )}
            </div>
            <div>
              <label className="block text-purple-300 mb-2 text-sm">
                Desired Lifespan: <span className="font-bold text-amber-300">{lifespan}</span> years
              </label>
              <input
                type="range"
                min="60"
                max="120"
                value={lifespan}
                onChange={(e) => setLifespan(parseInt(e.target.value))}
                className="w-full h-2 appearance-none rounded-full bg-purple-500/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400"
                aria-label={`Set lifespan to ${lifespan} years`}
              />
              {!isValidLifespan && (
                <p className="text-red-400 text-sm mt-1">Lifespan must be between 60 and 120 years.</p>
              )}
            </div>
            <button
              onClick={handleSetup}
              disabled={!name.trim() || !birthDate || !isValidBirthDate || !isValidLifespan}
              className="w-full bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-xl py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              Begin Journey
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 font-inter">
        {/* Audio Prompt */}
        {showAudioPrompt && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-black/80 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20 text-center">
              <p className="text-purple-300 mb-4">Tap to enable ambient meditation sound.</p>
              <button
                onClick={handleAudioPrompt}
                className="bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-xl py-2 px-4 font-medium hover:opacity-90"
              >
                Enable Sound
              </button>
            </div>
          </div>
        )}

        {/* Header and Sound Toggle */}
        <div className="pt-8 px-4 max-w-4xl mx-auto flex justify-between items-center">
          <h2 className="text-xl text-purple-300 font-light">
            Hello, <span className="font-semibold text-amber-400">{name}</span>.
          </h2>
          <button
            onClick={() => setIsSoundOn(prev => !prev)}
            className={`p-3 rounded-full transition-all ${isSoundOn ? 'bg-amber-600 text-white shadow-xl' : 'bg-black/30 text-purple-400 hover:bg-black/50'} shadow-lg`}
            aria-label={isSoundOn ? "Turn off ambient sound" : "Turn on ambient sound"}
          >
            {isSoundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 py-8 pb-24">
          {activeTab === 'clock' && timeData && (
            <div className="space-y-8 animate-fadeIn">
              <div className="text-center py-8">
                <p className="text-2xl text-purple-300/90 font-light leading-relaxed animate-pulse">
                  {MESSAGES[currentMessage]}
                </p>
              </div>
              <div className="relative flex items-center justify-center py-12">
                <svg className="w-64 h-64 transform -rotate-90" role="img" aria-label={`${timeData.percentage} percent of life lived`}>
                  <circle cx="128" cy="128" r="120" fill="none" stroke="rgba(168, 85, 247, 0.1)" strokeWidth="8" />
                  <circle
                    cx="128"
                    cy="128"
                    r="120"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 120}`}
                    strokeDashoffset={`${2 * Math.PI * 120 * (1 - timeData.percentage / 100)}`}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                  <defs>

                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">

                      <stop offset="0%" stopColor="#a855f7" />

                      <stop offset="100%" stopColor="#f59e0b" />

                    </linearGradient>

                  </defs>

                </svg>
                <div className="absolute text-center" aria-hidden="true">
                  <div className="text-5xl font-extrabold text-amber-400">{timeData.percentage}%</div>
                  <div className="text-sm text-purple-300 mt-1">lived</div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TimeStat title="Time Lived" data={timeData.lived} color="purple" showHourlyBreakdown={showHourlyBreakdown} />


                <TimeStat title="Time Remaining" data={timeData.remaining} color="amber" showHourlyBreakdown={true} />


              </div>
              <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-4 border border-purple-500/20 shadow-inner text-center text-purple-300/80">
                <p>
                  <span className="font-semibold text-amber-300">{timeData.remaining.years} years</span> remaining until the age of {lifespan}.
                </p>
                <p className="text-sm mt-1">
                  Total time is calculated from **{birthDate}** at **{birthTime}**.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'purpose' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-center py-6">
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-amber-400 mb-2">
                  Your Purpose
                </h2>
                <p className="text-purple-300/70">Did you fulfill your duties today?</p>
              </div>
              <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20 shadow-xl">
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newDuty}
                    onChange={(e) => setNewDuty(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addDuty()}
                    placeholder="Add a meaningful duty..."
                    className="flex-1 bg-black/30 border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-purple-300/30 focus:outline-none focus:border-purple-400"
                    aria-label="Add new duty"
                  />
                  <button
                    onClick={addDuty}
                    className="bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-xl px-6 py-3 font-medium hover:opacity-90"
                    aria-label="Add duty"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-2">
                  {duties.length === 0 ? (
                    <div className="text-center py-8 text-purple-300/50">
                      <p className="mb-4">Start with something simple:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {DUTY_EXAMPLES.map((ex, i) => (
                          <button
                            key={i}
                            onClick={() => setNewDuty(ex)}
                            className="px-3 py-1 bg-black/30 border border-purple-500/30 rounded-lg text-sm hover:bg-purple-500/20 text-purple-300 transition-colors"
                            aria-label={`Set duty to ${ex}`}
                          >
                            {ex}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <FixedSizeList
                      height={400}
                      width="100%"
                      itemCount={duties.length}
                      itemSize={60}
                    >
                      {({ index, style }) => (
                        <div
                          style={style}
                          onClick={() => toggleDuty(duties[index].id)}
                          onKeyDown={(e) => e.key === 'Enter' && toggleDuty(duties[index].id)}
                          tabIndex={0}
                          className="flex items-center gap-3 p-4 bg-black/20 rounded-xl cursor-pointer hover:bg-black/30 transition-colors shadow-inner"
                          role="button"
                          aria-label={`Toggle duty: ${duties[index].text}`}
                        >
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                            duties[index].completed ? 'bg-amber-500 border-amber-500' : 'border-purple-400'
                          }`}>
                            {duties[index].completed && <span className="text-gray-900 text-sm font-bold">✓</span>}
                          </div>
                          <span className={`flex-1 ${duties[index].completed ? 'text-purple-300/50 line-through' : 'text-white'}`}>
                            {duties[index].text}
                          </span>
                        </div>
                      )}
                    </FixedSizeList>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'journal' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-center py-6">
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-amber-400 mb-2">
                  Your Journal
                </h2>
                <p className="text-purple-300/70">Capture your thoughts and inspirations</p>
              </div>
              <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20 shadow-xl">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setNoteType('idea')}
                    className={`px-4 py-2 rounded-xl transition-colors font-medium ${
                      noteType === 'idea' ? 'bg-purple-600 text-white shadow-md' : 'bg-black/30 text-purple-300 hover:bg-black/50'
                    }`}
                    aria-label="Select idea note type"
                  >
                    💭 Idea
                  </button>
                  <button
                    onClick={() => setNoteType('inspired')}
                    className={`px-4 py-2 rounded-xl transition-colors font-medium ${
                      noteType === 'inspired' ? 'bg-purple-600 text-white shadow-md' : 'bg-black/30 text-purple-300 hover:bg-black/50'
                    }`}
                    aria-label="Select inspired note type"
                  >
                    ⚡ Inspired
                  </button>
                </div>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Write your thoughts..."
                  className="w-full bg-black/30 border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-purple-300/30 focus:outline-none focus:border-purple-400 min-h-32 mb-4"
                  aria-label="Journal entry"
                />
                <button
                  onClick={addNote}
                  className="w-full bg-gradient-to-r from-purple-600 to-amber-600 text-white rounded-xl py-3 font-medium hover:opacity-90 transition-opacity shadow-lg"
                  aria-label="Save journal note"
                >
                  Save Note
                </button>
              </div>
              <NoteList notes={notes} />
            </div>
          )}

          {/* ... (Fantastic and Settings views remain similar, with added accessibility and validation) */}

          {/* Bottom Navigation */}
          <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-purple-500/20 shadow-2xl z-10">
            <div className="max-w-4xl mx-auto px-2 py-2 md:px-4 md:py-3">
              <div className="flex justify-around">
                {[
                  { id: 'clock', icon: Clock, label: 'Clock' },
                  { id: 'purpose', icon: Target, label: 'Purpose' },
                  { id: 'journal', icon: BookOpen, label: 'Journal' },
                  { id: 'fantastic', icon: Sparkles, label: 'Fantastic' },
                  { id: 'settings', icon: Settings, label: 'Settings' },
                ].map((tab, index) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setActiveTab(tab.id)}
                    tabIndex={0}
                    className={`flex flex-col items-center gap-1 p-2 md:p-3 rounded-xl transition-all ${
                      activeTab === tab.id
                        ? 'text-amber-400 bg-purple-500/30 shadow-inner'
                        : 'text-purple-300/60 hover:text-purple-300'
                    }`}
                    aria-label={`Switch to ${tab.label} tab`}
                    aria-current={activeTab === tab.id ? 'true' : 'false'}
                  >
                    <tab.icon className="w-5 h-5 md:w-6 md:h-6" />
                    <span className="text-xs">{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
          .font-inter { font-family: 'Inter', sans-serif; }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
          .animate-pulse { animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            cursor: pointer;
            box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.1);
          }
          input[type="date"]::-webkit-calendar-picker-indicator,
          input[type="time"]::-webkit-calendar-picker-indicator {
            filter: invert(1);
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}

Afterus.propTypes = {
  __app_id: PropTypes.string,
  __firebase_config: PropTypes.string,
  __initial_auth_token: PropTypes.string,
};
