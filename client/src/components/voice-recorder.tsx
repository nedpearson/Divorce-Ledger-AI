import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  onTranscript: (transcript: string) => void;
  onRecordingComplete?: (audioBlob: Blob) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

export function VoiceRecorder({
  onTranscript,
  onRecordingComplete,
  disabled = false,
  className,
  placeholder = 'Click mic to start speaking...',
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef('');
  const onTranscriptRef = useRef(onTranscript);

  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('Voice input not supported in this browser');
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    audioChunksRef.current = [];
    transcriptRef.current = '';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input not supported');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (onRecordingComplete) {
          onRecordingComplete(audioBlob);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start(1000);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.info('Audio recording not available, continuing with speech only');
      }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
      setIsProcessing(false);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalTranscript) {
        transcriptRef.current += finalTranscript;
        setTranscript(transcriptRef.current);
        onTranscriptRef.current(transcriptRef.current);
      }
      setInterimTranscript(interim);
    };

    let shouldRestart = true;

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      shouldRestart = false;
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please enable microphone permissions.');
      } else if (event.error === 'no-speech') {
        shouldRestart = true;
      } else if (event.error === 'aborted') {
        shouldRestart = false;
      } else {
        setError(`Error: ${event.error}`);
      }
      if (!shouldRestart) {
        setIsRecording(false);
        setIsProcessing(false);
      }
    };

    recognition.onend = () => {
      if (shouldRestart && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          setIsRecording(false);
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    setIsProcessing(true);

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
    setIsProcessing(false);
    setInterimTranscript('');
  }, []);

  if (!isSupported) {
    return (
      <div className={cn('flex items-center gap-2 text-muted-foreground text-sm', className)}>
        <MicOff className="h-4 w-4" />
        <span>Voice input not supported</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant={isRecording ? 'destructive' : 'outline'}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || isProcessing}
          data-testid="button-voice-record"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isRecording ? (
            <Square className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        {isRecording && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
            </span>
            <span className="text-sm text-muted-foreground">Recording...</span>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" data-testid="text-voice-error">
          {error}
        </p>
      )}

      {(transcript || interimTranscript) && (
        <div className="p-3 rounded-md bg-muted/50 text-sm" data-testid="text-voice-transcript">
          <span>{transcript}</span>
          <span className="text-muted-foreground">{interimTranscript}</span>
        </div>
      )}

      {!isRecording && !transcript && !error && (
        <p className="text-sm text-muted-foreground">{placeholder}</p>
      )}
    </div>
  );
}

export function VoiceInputButton({
  onTranscript,
  disabled = false,
  className,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const accumulatedRef = useRef('');
  const isRecordingRef = useRef(false);

  const toggleRecording = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if (accumulatedRef.current.trim()) {
        onTranscript(accumulatedRef.current.trim());
      }
      accumulatedRef.current = '';
      setIsRecording(false);
    } else {
      accumulatedRef.current = '';
      isRecordingRef.current = true;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            accumulatedRef.current += event.results[i][0].transcript + ' ';
          }
        }
      };

      recognition.onerror = () => {
        isRecordingRef.current = false;
        setIsRecording(false);
      };

      recognition.onend = () => {
        if (isRecordingRef.current && recognitionRef.current === recognition) {
          try {
            recognition.start();
          } catch {
            isRecordingRef.current = false;
            setIsRecording(false);
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    }
  }, [onTranscript]);

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  if (!SpeechRecognition) {
    return null;
  }

  return (
    <Button
      type="button"
      size="icon"
      variant={isRecording ? 'destructive' : 'ghost'}
      onClick={toggleRecording}
      disabled={disabled}
      className={className}
      data-testid="button-voice-input"
    >
      {isRecording ? (
        <span className="relative flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <MicOff className="relative h-4 w-4" />
        </span>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
