interface ErrorMessageProps {
  message: string;
}

export default function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="border border-red-500 bg-red-950 text-red-300 rounded-md px-4 py-3">
      {message}
    </div>
  );
}
