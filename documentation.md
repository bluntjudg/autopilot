Step 1 :- google-chrome   --remote-debugging-port=9222 --user-data-dir=$HOME/chrome-cdp
Step 2 :-  cd reddit-automation/
 
Step 3 :-  curl http://localhost:9222/json/version
{
   "Browser": "Chrome/143.0.7499.192",
   "Protocol-Version": "1.3",
   "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
   "V8-Version": "14.3.127.17",
   "WebKit-Version": "537.36 (@be2c1f4fd451578a9ada68a0ac12d659362b44bf)",
   "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/1bdb0cc0-cd2d-44f2-8760-949fc6f20221"
}


Step 4:- node autopilot.js 