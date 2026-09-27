import { Link } from 'react-router-dom';
import { EmptyState } from '../components/States';

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState title="We couldn't find that page.">
        <Link to="/" className="btn btn-primary btn-large">
          Go to Today
        </Link>
      </EmptyState>
    </div>
  );
}
