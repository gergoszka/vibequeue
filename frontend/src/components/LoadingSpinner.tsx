export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin" />
    </div>
  );
}
