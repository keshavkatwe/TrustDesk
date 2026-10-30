import { BrowserRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppRoutes } from '@/routes';

export function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <AppRoutes />
      </TooltipProvider>
    </BrowserRouter>
  );
}
