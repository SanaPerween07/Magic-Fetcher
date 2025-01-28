import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Download, CheckCircle, XCircle } from 'lucide-react';

interface VideoStatus {
  url: string;
  title: string;
  channel: string;
  videoId: string;
  uniqueTitle: string;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  error?: string;
  downloadTime?: string;
  size?: string;
}

const Index = () => {
  const [videos, setVideos] = useState<VideoStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const startDownloads = async () => {
      const pendingVideos = videos.filter(v => v.status === 'pending');
      
      for (const video of pendingVideos) {
        const index = videos.findIndex(v => v.url === video.url);
        try {
          await downloadVideo(video, index);
        } catch (error) {
          console.error('Download failed:', error);
          setVideos(prev => prev.map((v, i) => 
            i === index ? { ...v, status: 'error', error: error.message } : v
          ));
          toast({
            title: "Download failed",
            description: `Failed to download: ${video.url}`,
            variant: "destructive"
          });
        }
      }
    };

    if (videos.length > 0) {
      startDownloads();
    }
  }, [videos.length]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const urls = text.split('\n')
        .map(url => url.trim())
        .filter(url => url && (url.includes('youtube.com') || url.includes('youtu.be')));

      if (urls.length === 0) {
        toast({
          title: "No valid YouTube URLs found",
          description: "Please check your text file and try again.",
          variant: "destructive"
        });
        setIsProcessing(false);
        return;
      }

      const videoStatuses = urls.map(url => ({
        url,
        title: '',
        channel: '',
        videoId: '',
        uniqueTitle: '',
        progress: 0,
        status: 'pending' as const
      }));

      setVideos(videoStatuses);
      setIsProcessing(false);
    };

    reader.readAsText(file);
  };

  const fetchVideoTitle = async (url) => {
    try {
      const response = await fetch('https://video-magic-fetcher.onrender.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
  
      if (!response.ok) {
        // If the response is not OK, throw an error with the status text
        throw new Error(`Server returned an error: ${response.statusText}`);
      }

      const data = await response.json();
  
      return { channel: data.channel, title: data.title, videoId: data.videoId };
    } catch (error) {
      console.error('Error fetching video info:', error);
      toast({
        title: "Failed to fetch video info",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }
  };
  
  const downloadVideo = async (videoStatus, index) => {
    try {
      const videoInfo = videoStatus.videoId
        ? { channel: videoStatus.channel, title: videoStatus.title, videoId: videoStatus.videoId }
        : await fetchVideoTitle(videoStatus.url);
  
      if (!videoInfo) return;
  
      const { channel, title, videoId } = videoInfo;
      const uniqueTitle = `${channel} - ${title} [${videoId}]`;
  
      setVideos((prev) =>
        prev.map((v, i) =>
          i === index
            ? {
                ...v,
                status: 'downloading',
                channel,
                title,
                videoId,
                uniqueTitle,
              }
            : v
        )
      );
  
      const response = await fetch('https://video-magic-fetcher.onrender.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoStatus.url }),
      });
  
      if (!response.ok) {
        throw new Error('Download failed');
      }
  
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${uniqueTitle}.mp4`; // Ensure the filename matches the video title
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  
      window.URL.revokeObjectURL(downloadUrl);
  
      setVideos((prev) =>
        prev.map((v, i) =>
          i === index
            ? {
                ...v,
                status: 'completed',
                progress: 100,
                downloadTime: new Date().toLocaleString(),
                channel,
                title,
                videoId,
                uniqueTitle,
              }
            : v
        )
      );
  
      toast({
        title: 'Download complete',
        description: `Downloaded: ${channel} - ${title}`,
      });
    } catch (error) {
      console.error('Download error:', error);
      setVideos((prev) =>
        prev.map((v, i) =>
          i === index ? { ...v, status: 'error', error: error.message } : v
        )
      );
      toast({
        title: 'Download failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };
  
  

  // Utility function to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const handleDownload = (fileName: string) => {
    const sanitizedFileName = fileName.replace(/[^a-z0-9]/gi, '_');
    const downloadUrl = `/downloads/${sanitizedFileName}.mp4`;
  
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${sanitizedFileName}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  
    toast({
      title: "Download started",
      description: `Downloading file: ${fileName}`,
    });
    console.log();
  };
  

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h1 className="text-4xl font-semibold text-gray-900">Video Downloader</h1>
          <p className="text-gray-600">Upload a text file containing YouTube URLs to download videos</p>
        </motion.div>

        <motion.div 
          className="flex justify-center"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <input
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            ref={fileInputRef}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="px-6 py-3 space-x-2"
          >
            <Upload className="w-5 h-5" />
            <span>{isProcessing ? 'Processing...' : 'Upload URL File'}</span>
          </Button>
        </motion.div>

        <AnimatePresence>
          {videos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              {videos.map((video, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="truncate flex-1">
                        <p className="text-sm text-gray-600">URL:</p>
                        <p className="truncate text-gray-900">{video.url}</p>
                        {video.title && (
                          <>
                            <p className="text-sm text-gray-600 mt-2">Title:</p>
                            <p className="truncate text-gray-900">{video.title}</p>
                          </>
                        )}
                        {video.downloadTime && (
                          <p className="text-xs text-gray-500 mt-1">
                            Downloaded at: {video.downloadTime}
                          </p>
                        )}
                      </div>
                      {video.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : video.status === 'error' ? (
                        <XCircle className="w-5 h-5 text-red-500" />
                      ) : (
                        <Download className="w-5 h-5 animate-pulse" />
                      )}
                    </div>
                    {video.status === 'downloading' && (
                      <Progress value={video.progress} className="h-2" />
                    )}
                    {video.status === 'error' && (
                      <p className="text-sm text-red-500">{video.error}</p>
                    )}
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Index;