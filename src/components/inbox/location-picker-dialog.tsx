'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MapPin,
  Navigation,
  Send,
  Loader2,
  Sparkles,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  describeParseFailure,
  isGoogleShortLink,
  parseLocationInput,
} from '@/lib/geo/parse-location';

export interface LocationPayload {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * Default wording for a location request.
 *
 * Exported because there are two entry points into this flow — this
 * dialog, and the one-tap button on the "Live Location Shared" limitation
 * card in the thread. The card sends without opening a dialog, so if the
 * text were duplicated the two paths would drift and customers would get
 * different prompts depending on which one the agent happened to use.
 */
export const DEFAULT_LOCATION_REQUEST_PROMPT =
  'Please share your current or delivery location with us.';

interface LocationPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendLocation: (location: LocationPayload) => void;
  onRequestLocation: (promptText: string) => void;
}

export function LocationPickerDialog({
  open,
  onOpenChange,
  onSendLocation,
  onRequestLocation,
}: LocationPickerDialogProps) {
  const [activeTab, setActiveTab] = useState<'send' | 'request'>('send');

  // Send Pin state
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);
  /** Pasted Google Maps link or raw "lat, lng". */
  const [linkInput, setLinkInput] = useState('');
  const [resolving, setResolving] = useState(false);

  // Request Location state
  const [requestPrompt, setRequestPrompt] = useState(
    DEFAULT_LOCATION_REQUEST_PROMPT
  );

  /**
   * Try the browser's location, twice.
   *
   * The retry is the actual fix, not a flourish. With
   * `enableHighAccuracy: true` a desktop asks for GPS-grade precision it
   * usually cannot produce and fails with POSITION_UNAVAILABLE; dropping to
   * the coarse, network-based lookup frequently succeeds on the same
   * machine. The original code made one high-accuracy attempt and reported
   * a single generic sentence for every possible cause, so a blocked
   * permission, a desktop with no GPS and a slow fix were indistinguishable
   * — and none of them told the operator what to do next.
   */
  const requestPosition = (highAccuracy: boolean, isRetry: boolean) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
        const accuracy = Math.round(pos.coords.accuracy);
        toast.success(
          `Location detected (accurate to about ${accuracy} m). Check it before sending.`
        );
      },
      (err) => {
        // A coarse retry is worth one attempt when precision was the
        // problem. A denied permission will never succeed, so do not retry
        // it — that would just prompt the user twice.
        if (!isRetry && err.code !== err.PERMISSION_DENIED) {
          requestPosition(false, true);
          return;
        }

        setLocating(false);
        console.error('Geolocation error:', err.code, err.message);

        switch (err.code) {
          case err.PERMISSION_DENIED:
            toast.error(
              'Location permission is blocked for this site. Click the icon at the left of the address bar, allow Location, then try again — or paste a Google Maps link below.'
            );
            break;
          case err.POSITION_UNAVAILABLE:
            toast.error(
              'Your device could not determine a location. This is normal on a desktop without GPS — paste a Google Maps link below instead.'
            );
            break;
          case err.TIMEOUT:
            toast.error(
              'Locating took too long. Try again, or paste a Google Maps link below.'
            );
            break;
          default:
            toast.error(
              'Could not get your location. Paste a Google Maps link below instead.'
            );
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        // 10s was tight for a cold fix. The coarse retry gets less, since
        // a network lookup either answers quickly or not at all.
        timeout: highAccuracy ? 20000 : 8000,
        // A fix from the last minute is fine and returns instantly.
        maximumAge: 60000,
      }
    );
  };

  const handleGetCurrentPosition = () => {
    if (!navigator.geolocation) {
      toast.error(
        'This browser has no location support. Paste a Google Maps link below instead.'
      );
      return;
    }
    // Browsers only expose geolocation over HTTPS (localhost aside). Worth
    // naming explicitly, because the failure otherwise arrives as a
    // permission error nobody can grant.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      toast.error(
        'Location needs a secure (HTTPS) connection. Paste a Google Maps link below instead.'
      );
      return;
    }

    setLocating(true);
    requestPosition(true, false);
  };

  /**
   * Read coordinates out of a pasted Google Maps link or a raw pair.
   *
   * This is the primary path, and GPS is the convenience. The pin an agent
   * needs to send is almost never where the agent is sitting — it is the
   * warehouse, the showroom, the customer's address — so "detect where I am"
   * answers a question nobody asked, while "paste the place you already
   * looked up" matches what they are actually doing.
   */
  const handleUseLink = async () => {
    let text = linkInput.trim();
    if (!text) {
      toast.error('Paste a Google Maps link or coordinates first.');
      return;
    }

    setResolving(true);
    try {
      // Short links are opaque until followed, and the browser cannot read
      // the redirect itself (CORS), so the server expands it.
      if (isGoogleShortLink(text)) {
        const res = await fetch('/api/geo/expand-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: text }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || typeof payload.url !== 'string') {
          toast.error(payload.error || 'Could not expand that short link.');
          return;
        }
        text = payload.url;
      }

      const parsed = parseLocationInput(text);
      if (!parsed.ok) {
        toast.error(describeParseFailure(parsed.reason));
        return;
      }

      setLatitude(parsed.value.latitude.toFixed(6));
      setLongitude(parsed.value.longitude.toFixed(6));
      // Only fill the name if the agent has not typed one — their wording
      // beats a slug pulled out of a URL.
      if (parsed.value.name && !placeName.trim()) {
        setPlaceName(parsed.value.name);
      }
      toast.success('Coordinates read from the link.');
    } finally {
      setResolving(false);
    }
  };

  const handleSendPin = () => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      toast.error('Please enter a valid latitude (-90 to 90).');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      toast.error('Please enter a valid longitude (-180 to 180).');
      return;
    }

    onSendLocation({
      latitude: lat,
      longitude: lng,
      name: placeName.trim() || undefined,
      address: address.trim() || undefined,
    });

    onOpenChange(false);
    // Reset fields
    setLatitude('');
    setLongitude('');
    setPlaceName('');
    setAddress('');
    setLinkInput('');
  };

  const handleSendRequest = () => {
    if (!requestPrompt.trim()) {
      toast.error('Please enter a prompt message.');
      return;
    }

    onRequestLocation(requestPrompt.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="text-primary h-5 w-5" />
            Share or Request Location
          </DialogTitle>
          <DialogDescription>
            Send a location pin to the customer or request their live location.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'send' | 'request')}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="send">Send Location Pin</TabsTrigger>
            <TabsTrigger value="request">Request Location</TabsTrigger>
          </TabsList>

          {/* Send Location Tab */}
          <TabsContent value="send" className="space-y-3 pt-2">
            {/* Paste-a-link FIRST, because it is the path that always
                works and the one that matches what an agent is doing.
                Typing latitude and longitude by hand was previously the
                only reliable option, which is a poor ask for a CRM. */}
            <div className="space-y-1">
              <Label htmlFor="loc-link" className="text-xs">
                Paste a Google Maps link
              </Label>
              <div className="flex gap-2">
                <Input
                  id="loc-link"
                  placeholder="maps.google.com/... or 19.0760, 72.8777"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleUseLink();
                    }
                  }}
                  onPaste={(e) => {
                    // Resolve on paste. The agent's intent is unambiguous,
                    // and making them paste and then click Use is a step
                    // that exists only because the code needed it.
                    const pasted = e.clipboardData.getData('text');
                    if (pasted.trim()) {
                      e.preventDefault();
                      setLinkInput(pasted.trim());
                      queueMicrotask(() => void handleUseLink());
                    }
                  }}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 gap-1.5 text-xs"
                  onClick={() => void handleUseLink()}
                  disabled={resolving || !linkInput.trim()}
                >
                  {resolving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  Use
                </Button>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Find the place in Google Maps, copy the link, paste it here.
                Short share links work too.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-[10px] uppercase">
                or
              </span>
              <div className="bg-border h-px flex-1" />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-primary h-8 gap-1.5 text-xs"
                onClick={handleGetCurrentPosition}
                disabled={locating}
                title="Uses this device's location — only useful when the pin you want to send is where you are now."
              >
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Navigation className="h-3.5 w-3.5" />
                )}
                {locating ? 'Locating…' : 'Use my current location'}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="loc-lat" className="text-xs">
                  Latitude *
                </Label>
                <Input
                  id="loc-lat"
                  placeholder="e.g. 37.4421"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loc-lng" className="text-xs">
                  Longitude *
                </Label>
                <Input
                  id="loc-lng"
                  placeholder="e.g. -122.1615"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="loc-name" className="text-xs">
                Place / Business Name (optional)
              </Label>
              <Input
                id="loc-name"
                placeholder="e.g. Downtown Office / Warehouse 4"
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="loc-address" className="text-xs">
                Street Address (optional)
              </Label>
              <Input
                id="loc-address"
                placeholder="e.g. 101 Market St, Suite 500"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSendPin}
                disabled={!latitude.trim() || !longitude.trim()}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Send Location Pin
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Request Location Tab */}
          <TabsContent value="request" className="space-y-3 pt-2">
            <div className="border-primary/20 bg-primary/5 text-muted-foreground space-y-1 rounded-lg border p-3 text-xs">
              <p className="text-foreground flex items-center gap-1.5 font-medium">
                <Sparkles className="text-primary h-3.5 w-3.5" />
                Native WhatsApp Location Request
              </p>
              <p>
                WhatsApp renders an interactive <strong>Send Location</strong>{' '}
                button on the customer&apos;s phone. When tapped, their
                coordinates are returned directly to this thread.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="loc-req-prompt" className="text-xs">
                Prompt Message *
              </Label>
              <Input
                id="loc-req-prompt"
                placeholder="e.g. Please share your delivery address / location."
                value={requestPrompt}
                onChange={(e) => setRequestPrompt(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSendRequest}
                disabled={!requestPrompt.trim()}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Request Location
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
