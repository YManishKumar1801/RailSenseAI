import { useState } from 'react';
import {
  auth, googleProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup
} from './firebase';
import './Login.css';

function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailAuth(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(friendlyError(err.code));
    }
    setLoading(false);
  }

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(friendlyError(err.code));
    }
    setLoading(false);
  }

  function friendlyError(code) {
    if (code === 'auth/email-already-in-use') return 'This email is already registered. Try logging in instead.';
    if (code === 'auth/invalid-credential') return 'Incorrect email or password.';
    if (code === 'auth/weak-password') return 'Password should be at least 6 characters.';
    if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
    return 'Something went wrong. Please try again.';
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="signal-dot" aria-hidden="true"></div>
        <p className="eyebrow">RailSense AI</p>
        <h1>Welcome to RailSenseAI</h1>
        <p className="subtitle">{isSignUp ? 'Create an account to continue' : 'Log in to continue'}</p>

        <form onSubmit={handleEmailAuth}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Log In')}
          </button>
        </form>

        <div className="divider"><span>or</span></div>

        <button className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
          Continue with Google
        </button>

        <p className="toggle-text">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
            {isSignUp ? 'Log In' : 'Sign Up'}
          </span>
        </p>
      </div>
    </div>
  );
}

export default Login