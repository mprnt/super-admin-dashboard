import { ConsoleProvider } from '@/lib/client/console';
import { ToastProvider } from '@/components/ui/data';
import { ConsoleShell } from '@/components/console/Shell';

/**
 * Every page that needs a platform session. Middleware has already checked the
 * session before this renders; the backend checks each request it makes.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConsoleProvider>
        <ConsoleShell>{children}</ConsoleShell>
      </ConsoleProvider>
    </ToastProvider>
  );
}
