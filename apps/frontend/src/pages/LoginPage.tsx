import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import {
  LocalShipping as TruckIcon,
  LockOutlined as LockIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  // 2FA state
  const [twoFactorMode, setTwoFactorMode] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (twoFactorMode && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [twoFactorMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password });
      const result = data.data;

      if (result.requiresTwoFactor) {
        // Switch to 2FA mode
        setTempToken(result.tempToken);
        setTwoFactorMode(true);
        setVerificationCode('');
      } else {
        // Normal login
        login(result.user, result.accessToken, result.refreshToken);
        const role = result.user.role;
        const targetPath = role === 'DRIVER' ? '/driver' : role === 'INSTALLER' ? '/installer' : '/orders';
        navigate(targetPath);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/verify-2fa', {
        tempToken,
        code: verificationCode,
      });
      const result = data.data;
      login(result.user, result.accessToken, result.refreshToken);
      const role = result.user.role;
      const targetPath = role === 'DRIVER' ? '/driver' : role === 'INSTALLER' ? '/installer' : '/orders';
      navigate(targetPath);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'שגיאה באימות קוד');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    setResendSuccess(false);
    setError('');

    try {
      await api.post('/auth/resend-2fa', { tempToken });
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'שגיאה בשליחת קוד חדש');
    } finally {
      setResending(false);
    }
  };

  const handleBackToLogin = () => {
    setTwoFactorMode(false);
    setTempToken('');
    setVerificationCode('');
    setError('');
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%', mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            {twoFactorMode ? (
              <LockIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            ) : (
              <TruckIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            )}
            <Typography variant="h5" fontWeight="bold">
              {twoFactorMode ? 'אימות דו-שלבי' : 'מערכת ניהול הובלות'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {twoFactorMode
                ? 'הזן את הקוד שנשלח לאימייל שלך'
                : 'התחבר למערכת'}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {resendSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              קוד חדש נשלח לאימייל שלך
            </Alert>
          )}

          {!twoFactorMode ? (
            /* Login Form */
            <Box component="form" onSubmit={handleLogin}>
              <TextField
                fullWidth
                label="אימייל"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
                autoFocus
              />
              <TextField
                fullWidth
                label="סיסמה"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
              />
              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {loading ? <CircularProgress size={24} /> : 'התחבר'}
              </Button>
            </Box>
          ) : (
            /* 2FA Verification Form */
            <Box component="form" onSubmit={handleVerify2FA}>
              <TextField
                fullWidth
                label="קוד אימות (6 ספרות)"
                value={verificationCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(val);
                }}
                margin="normal"
                required
                inputRef={codeInputRef}
                inputProps={{
                  maxLength: 6,
                  inputMode: 'numeric',
                  pattern: '[0-9]*',
                  style: {
                    textAlign: 'center',
                    fontSize: '1.5rem',
                    letterSpacing: '0.5rem',
                    fontWeight: 'bold',
                  },
                }}
                placeholder="______"
              />
              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading || verificationCode.length !== 6}
                sx={{ mt: 2 }}
              >
                {loading ? <CircularProgress size={24} /> : 'אמת קוד'}
              </Button>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, alignItems: 'center' }}>
                <Link
                  component="button"
                  type="button"
                  variant="body2"
                  onClick={handleBackToLogin}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <BackIcon fontSize="small" />
                  חזור
                </Link>
                <Link
                  component="button"
                  type="button"
                  variant="body2"
                  onClick={handleResendCode}
                  disabled={resending}
                >
                  {resending ? 'שולח...' : 'שלח קוד מחדש'}
                </Link>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
