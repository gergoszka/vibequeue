import { Link } from 'react-router-dom';
import Layout from '../components/Layout';

export default function NotFoundPage() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <h1 className="text-4xl font-bold">Page not found</h1>
        <p className="text-gray-400">The page you are looking for does not exist.</p>
        <Link
          to="/"
          className="mt-4 text-white underline underline-offset-4 hover:text-gray-300 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </Layout>
  );
}
