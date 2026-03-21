import { Paper, Typography, Box } from '@mui/material';
import { ReactNode } from 'react';

const HEADER_COLOR = '#1e3a5f';

interface PageHeaderProps {
  title: string;
  children?: ReactNode;
}

export default function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: HEADER_COLOR,
        color: 'white',
        px: 2,
        py: 1,
        mb: 0,
        borderRadius: '8px 8px 0 0',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 700, color: 'white' }}>
        {title}
      </Typography>
      {children && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
          {children}
        </Box>
      )}
    </Paper>
  );
}
