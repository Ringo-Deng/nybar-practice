import React from 'react';
import ReactDOM from 'react-dom/client';
import {ThemeProvider} from 'next-themes';
import StudyApp from '@/app/study-app';
import '@/app/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
 <React.StrictMode>
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
   <StudyApp authenticated={false} standalone/>
  </ThemeProvider>
 </React.StrictMode>,
);
