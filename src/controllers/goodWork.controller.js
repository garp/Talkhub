const { logInfo } = require('../../lib/helpers/logger');

const goodWorkHimanshu = (req, res) => {
  logInfo('Good work Himanshu endpoint accessed! 🎉');

  const videoUrl = 'https://rr2---sn-qxaeenl6.googlevideo.com/videoplayback?expire=1762284107&ei=6v0JacXpOubT6dsP9pHr-Qs&ip=2a11%3Aa685%3Aa39c%3Aefd5%3A2c23%3Afb16%3Ad0fa%3A2f3a&id=o-ADREzxKFUERSnCM7psZNHviODrNnKUu_XcG0jr7EwGXc&itag=18&source=youtube&requiressl=yes&xpc=EgVo2aDSNQ%3D%3D&rms=au%2Cau&bui=AdEuB5RMcuVMGGWnM09bVQ_Y33tSpyemVtmoOUTCIkrNzrNyk9af5YYJsHw-1hWUhtzSbQ7XOsOdrGEu&spc=6b0G_K_U1fN1RWRawoFZ&vprv=1&svpuc=1&mime=video%2Fmp4&rqh=1&gir=yes&clen=1202464&ratebypass=yes&dur=16.213&lmt=1761481581873745&fexp=24352157,24352916,24352919,24352961,24353009,24353012,24353227,24353230,24353287,24353290,24353701,24353704,24353795,24353798,24354011,24354014,51552689,51565115,51565682,51580968&c=ANDROID&txp=5430534&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cxpc%2Cbui%2Cspc%2Cvprv%2Csvpuc%2Cmime%2Crqh%2Cgir%2Cclen%2Cratebypass%2Cdur%2Clmt&sig=AJfQdSswRgIhANWq55JoX5Uz09YNI41sxSdvPU_DoDdtoK8x2AbL6KhGAiEAxtQNO8eAGbF3kw7sG3ey-BmhLq6IRCC8PzSS3x-zC50%3D&title=IAS%20ki%20Tayari%20Chod%20do%20%F0%9F%A4%A1%F0%9F%A5%B2ias%20kumarsir&rm=sn-5hnesl7s,sn-gwpa-w5py76,sn-gwpa-qxay7l&rrc=104,13,23&req_id=450567bf2edda3ee&ipbypass=yes&redirect_counter=3&cms_redirect=yes&cmsv=e&met=1762262513,&mh=6_&mip=2405:201:5c1a:83b:2061:6f16:1fc3:dd85&mm=30&mn=sn-qxaeenl6&ms=nxu&mt=1762261992&mv=m&mvi=2&pl=49&lsparams=ipbypass,met,mh,mip,mm,mn,ms,mv,mvi,pl,rms&lsig=APaTxxMwRgIhAJj8qrxqrbdZo4q9fnG6uZzyOfsRfm1wDQeOwx2SkoyRAiEA5F4DTQ-K6XI1OYUjRYqmEKucZDFhUkJhsL-vQHGPoN8%3D';

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Good Work Himanshu! 🎉</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: 'Arial', sans-serif;
      overflow: hidden;
    }
    
    .container {
      text-align: center;
      padding: 10px;
      max-width: 95%;
      width: 100%;
    }
    
    h1 {
      color: white;
      font-size: 2rem;
      margin-bottom: 20px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
      animation: bounce 1s ease-in-out infinite;
    }
    
    .video-wrapper {
      position: relative;
      background: rgba(0,0,0,0.3);
      border-radius: 15px;
      padding: 15px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    
    video {
      width: 100%;
      max-width: 350px;
      height: auto;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    
    @media (max-width: 480px) {
      h1 {
        font-size: 1.5rem;
        margin-bottom: 15px;
      }
      
      video {
        max-width: 280px;
      }
      
      .video-wrapper {
        padding: 10px;
      }
    }
    
    @keyframes bounce {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-10px);
      }
    }
    
    .emoji {
      font-size: 4rem;
      animation: rotate 2s linear infinite;
      display: inline-block;
    }
    
    @keyframes rotate {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎊 Good Work Himanshu! 🎊</h1>
    <div class="video-wrapper">
      <video id="videoPlayer" controls autoplay muted loop>
        <source src="${videoUrl}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    </div>
  </div>
  
  <script>
    // Try to play with sound after user interaction
    const video = document.getElementById('videoPlayer');
    
    // Attempt to unmute and play
    video.muted = false;
    video.play().catch(() => {
      // If autoplay with sound fails, play muted first
      video.muted = true;
      video.play();
      
      // Unmute on first user interaction
      document.body.addEventListener('click', function unmute() {
        video.muted = false;
        video.play();
        document.body.removeEventListener('click', unmute);
      }, { once: true });
    });
  </script>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(htmlContent);
};

module.exports = {
  goodWorkHimanshu,
};
