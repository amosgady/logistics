import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  direction: 'rtl',
  typography: {
    fontFamily: '"Heebo", "Roboto", "Arial", sans-serif',
  },
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#f57c00' },
    background: {
      default: '#f5f5f5',
    },
  },
  components: {
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiButton: {
      defaultProps: {
        size: 'small',
      },
    },
  },
});

export default theme;
