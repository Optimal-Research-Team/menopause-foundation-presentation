/*!
 * <optimal-logo> — the Optimal "Into Range" logo animation, for the web.
 *
 * Seven grey markers glide into a hairline target ring, turn green as they arrive, the ring dissolves and
 * the wordmark wipes in. Same geometry, easing and timing as anim.py (the video renderer), drawn as live SVG:
 * sharp at any size, 12 KB gzipped, no dependencies.
 *
 *   <script src="optimal-logo.js" defer></script>
 *   <optimal-logo theme="dark"></optimal-logo>
 *
 * Attributes
 *   variant  inline (default)  forms in place — for a header, footer or wordmark row
 *            stage             the video choreography: forms large at centre, then settles into the lockup
 *   theme    light (default)   forest-green logo, for cream / white surfaces
 *            dark              cream logo, for forest-green surfaces
 *   play     visible (default) plays once when scrolled into view
 *            load              plays as soon as it is on the page
 *            manual            shows the finished logo until you call .play()
 *   speed    playback rate (default 1)
 *
 * CSS custom properties (optional colour overrides, any CSS colour)
 *   --optimal-logo-dot    finished dot colour        --optimal-logo-word   wordmark
 *   --optimal-logo-start  "out of range" marker      --optimal-logo-ring   target ring
 *   --optimal-logo-halo   arrival pulse
 *
 * Methods: play(), seek(seconds), finish().  Properties: currentTime, duration.  Event: "optimal-logo-done".
 * prefers-reduced-motion: always renders the finished logo.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.customElements || customElements.get('optimal-logo')) return;

  // ------------------------------------------------------------------ geometry (logo px, as in anim.py)
  // Measured from the design-system lockup OptimalLogo-Green.png (1748 x 534): [cx, cy, r]
  const DOTS = [[102.8, 242.4, 49.4], [150.8, 148.6, 39.2], [246.4, 148.4, 31.4], [300.2, 210.7, 25.4],
              [300.2, 274.0, 25.4], [246.1, 339.2, 34.6], [147.7, 339.0, 42.4]];
  const RING = [201.5, 244.2], RING_R = 104.9;
  const CONTENT = [54, 80, 1653, 454];          // lockup bbox anim.py centres on
  const BOX = [54, 80, 1600, 375];              // tight lockup viewBox for the inline variant
  const TEXT_X0 = 400, TEXT_W = 1260;           // wordmark sprite box in anim.py (origin of the wipe)
  const WORD_X = 408, WORD_Y = 80, WORD_S = 1.861627;   // vector wordmark (670 x 201.44) -> logo px
  const ORDER = [3, 0, 5, 2, 6, 4, 1];
  const STAGE_SCATTER = [[-310, -170], [250, -205], [-120, 215], [340, 120], [-395, 60], [60, -250], [190, 245]];
  const INLINE_SCATTER = [[560, 150], [1180, 400], [820, 420], [1480, 170], [1000, 130], [1330, 300], [700, 330]];

  // official wordmark outlines (beoptimal.ca OptimalTextIcon, viewBox 0 0 670 202)
  const WORDMARK = [
    "M620.946 157.378C619.943 157.378 619.083 156.948 618.367 156.088C617.794 155.085 617.507 154.082 617.507 153.079C617.65 150.93 618.152 149.783 619.012 149.64C620.015 149.353 621.161 149.21 622.451 149.21C626.463 149.21 629.185 148.565 630.618 147.276C632.194 145.843 633.054 143.98 633.198 141.687C633.484 139.395 633.627 137.03 633.627 134.594V29.7044C633.627 27.1252 633.484 24.7609 633.198 22.6115C633.054 20.3188 632.266 18.5277 630.833 17.238C629.4 15.8051 626.678 15.0887 622.666 15.0887C621.376 15.0887 620.158 14.9454 619.012 14.6588C618.009 14.2289 617.507 12.9393 617.507 10.7899C617.507 8.64052 618.653 7.35089 620.946 6.92101C627.537 5.91796 632.553 4.91492 635.992 3.91187C639.574 2.90883 642.297 2.04907 644.159 1.33261C646.022 0.616152 647.67 0.186277 649.103 0.0429863C650.249 -0.100304 651.181 0.114638 651.897 0.687807C652.757 1.26097 653.187 2.4073 653.187 4.12681V134.594C653.187 137.03 653.258 139.395 653.402 141.687C653.688 143.98 654.548 145.843 655.981 147.276C657.557 148.565 660.351 149.21 664.364 149.21C665.653 149.21 666.728 149.353 667.588 149.64C668.591 149.783 669.164 150.93 669.307 153.079C669.307 154.082 669.021 155.085 668.447 156.088C667.874 156.948 667.014 157.378 665.868 157.378C661.713 157.091 657.844 156.876 654.261 156.733C650.822 156.733 647.168 156.733 643.3 156.733C639.431 156.733 635.777 156.733 632.338 156.733C628.899 156.876 625.102 157.091 620.946 157.378Z",
    "M558.189 159.312C549.448 159.312 542.427 156.805 537.125 151.789C531.967 146.774 529.387 140.756 529.387 133.735C529.387 126.427 531.25 120.695 534.976 116.539C538.845 112.384 543.86 109.303 550.022 107.297C556.326 105.291 563.133 103.93 570.441 103.213C577.892 102.497 585.128 101.924 592.149 101.494V84.5137C592.149 77.779 590.43 72.5488 586.991 68.8232C583.695 64.9543 578.035 63.0199 570.011 63.0199C565.999 63.0199 562.201 64.3095 558.619 66.8888C555.18 69.468 553.461 73.1936 553.461 78.0655C553.461 80.3582 554.034 82.2927 555.18 83.8689C556.326 85.4451 557.473 86.6631 558.619 87.5228C559.765 88.3826 560.339 88.9557 560.339 89.2423C560.339 89.8155 559.479 90.8902 557.759 92.4664C556.183 93.8993 553.962 94.6158 551.096 94.6158C546.654 94.6158 543.215 92.9679 540.779 89.6722C538.343 86.3765 537.125 82.7225 537.125 78.7104C537.125 73.2653 538.773 68.9665 542.069 65.8141C545.508 62.6616 549.878 60.369 555.18 58.9361C560.482 57.5031 565.855 56.7867 571.3 56.7867C577.749 56.7867 583.982 57.5748 590 59.151C596.162 60.7272 601.177 63.7363 605.046 68.1784C609.058 72.6204 611.064 79.2835 611.064 88.1676V138.248C611.207 139.681 611.565 141.401 612.139 143.407C612.712 145.413 613.787 147.204 615.363 148.78C617.082 150.213 619.375 150.93 622.241 150.93C623.244 150.93 624.032 151.144 624.605 151.574C625.178 151.861 625.465 152.792 625.465 154.369C625.465 155.658 624.748 156.661 623.315 157.378C621.883 158.094 620.235 158.596 618.372 158.882C616.509 159.169 614.933 159.312 613.643 159.312C608.341 159.312 603.613 157.808 599.457 154.798C595.302 151.646 592.866 147.347 592.149 141.902C588.997 147.634 584.268 152.004 577.963 155.013C571.802 157.879 565.21 159.312 558.189 159.312ZM565.067 147.705C569.939 147.705 574.381 146.488 578.393 144.052C582.549 141.616 585.844 138.32 588.28 134.164C590.86 129.866 592.149 125.137 592.149 119.978V107.727C577.39 108.73 566.858 111.094 560.554 114.82C554.249 118.546 551.096 124.635 551.096 133.09C551.096 142.834 555.753 147.705 565.067 147.705Z",
    "M357.333 157.378C356.33 157.378 355.47 156.948 354.754 156.088C354.18 155.085 353.894 154.082 353.894 153.079C354.037 150.93 354.539 149.783 355.398 149.64C356.402 149.353 357.548 149.21 358.837 149.21C362.85 149.21 365.572 148.565 367.005 147.276C368.581 145.843 369.441 143.98 369.584 141.687C369.871 139.395 370.014 137.03 370.014 134.594V85.3734C370.014 82.7942 369.871 80.4299 369.584 78.2805C369.441 75.9878 368.653 74.1966 367.22 72.907C365.787 71.4741 363.065 70.7576 359.052 70.7576C357.763 70.7576 356.545 70.6143 355.398 70.3278C354.395 69.8979 353.894 68.6083 353.894 66.4589C353.894 64.3095 355.04 63.0199 357.333 62.59C363.924 61.5869 368.94 60.5839 372.379 59.5809C375.961 58.5778 378.612 57.7181 380.331 57.0016C382.194 56.2851 383.842 55.8553 385.275 55.712C386.421 55.5687 387.353 55.7836 388.069 56.3568C388.929 56.9299 389.359 58.0763 389.359 59.7958V73.3369H390.003C392.869 70.6143 395.664 68.0351 398.386 65.5991C401.109 63.0199 404.404 60.9421 408.273 59.3659C412.142 57.6464 417.086 56.7867 423.104 56.7867C430.125 56.7867 436.144 58.2912 441.159 61.3003C446.174 64.1662 449.828 68.1784 452.121 73.3369H452.55C455.416 70.6143 458.425 68.0351 461.578 65.5991C464.73 63.0199 468.456 60.9421 472.755 59.3659C477.053 57.6464 482.212 56.7867 488.23 56.7867C497.974 56.7867 505.712 59.7241 511.444 65.5991C517.175 71.4741 520.041 79.2119 520.041 88.8124V134.594C520.041 137.03 520.113 139.395 520.256 141.687C520.543 143.98 521.402 145.843 522.835 147.276C524.411 148.565 527.206 149.21 531.218 149.21C532.507 149.21 533.582 149.353 534.442 149.64C535.445 149.783 536.018 150.93 536.161 153.079C536.161 154.082 535.875 155.085 535.302 156.088C534.728 156.948 533.869 157.378 532.722 157.378C528.567 157.091 524.698 156.876 521.116 156.733C517.677 156.733 514.023 156.733 510.154 156.733C506.285 156.733 502.631 156.733 499.192 156.733C495.753 156.876 491.956 157.091 487.8 157.378C486.654 157.378 485.794 156.948 485.221 156.088C484.648 155.085 484.361 154.082 484.361 153.079C484.505 150.93 485.006 149.783 485.866 149.64C486.869 149.353 488.015 149.21 489.305 149.21C493.317 149.21 496.04 148.565 497.473 147.276C499.049 145.843 499.909 143.98 500.052 141.687C500.338 139.395 500.482 137.03 500.482 134.594V89.0274C500.482 84.2987 499.407 80.4299 497.258 77.4207C495.252 74.4116 492.672 72.1906 489.52 70.7576C486.367 69.3247 483.143 68.6082 479.848 68.6082C474.976 68.6082 470.82 69.5397 467.381 71.4025C463.942 73.122 461.22 75.128 459.214 77.4207C457.207 79.7134 455.775 81.7195 454.915 83.439V134.594C454.915 137.03 454.915 139.395 454.915 141.687C455.058 143.98 455.775 145.843 457.064 147.276C458.497 148.565 461.22 149.21 465.232 149.21C466.665 149.21 467.811 149.353 468.671 149.64C469.531 149.783 470.032 150.93 470.175 153.079C470.175 154.082 469.889 155.085 469.316 156.088C468.742 156.948 467.883 157.378 466.736 157.378C462.581 157.091 458.855 156.876 455.56 156.733C452.264 156.733 448.682 156.733 444.813 156.733C441.087 156.733 437.576 156.733 434.281 156.733C431.128 156.876 427.474 157.091 423.319 157.378C422.173 157.378 421.313 156.948 420.74 156.088C420.166 155.085 419.88 154.082 419.88 153.079C420.023 150.93 420.525 149.783 421.384 149.64C422.244 149.353 423.391 149.21 424.823 149.21C428.836 149.21 431.487 148.565 432.776 147.276C434.209 145.843 434.926 143.98 434.926 141.687C435.069 139.395 435.141 137.03 435.141 134.594V89.0274C435.141 81.8628 432.991 76.7043 428.692 73.5518C424.394 70.2561 419.737 68.6082 414.721 68.6082C409.706 68.6082 405.479 69.5397 402.04 71.4025C398.601 73.122 395.878 75.128 393.872 77.4207C391.866 79.7134 390.433 81.7195 389.574 83.439V134.594C389.574 137.03 389.645 139.395 389.789 141.687C390.075 143.98 390.935 145.843 392.368 147.276C393.944 148.565 396.738 149.21 400.75 149.21C402.04 149.21 403.115 149.353 403.974 149.64C404.978 149.783 405.551 150.93 405.694 153.079C405.694 154.082 405.407 155.085 404.834 156.088C404.261 156.948 403.401 157.378 402.255 157.378C398.099 157.091 394.231 156.876 390.648 156.733C387.209 156.733 383.555 156.733 379.686 156.733C375.818 156.733 372.164 156.733 368.725 156.733C365.286 156.876 361.488 157.091 357.333 157.378Z",
    "M312.198 159.592C311.195 159.592 309.9 156.948 309.183 156.088C308.61 155.085 308.324 154.082 308.324 153.079C308.61 150.93 309.183 149.783 310.043 149.64C310.903 149.353 312.049 149.21 313.482 149.21C317.494 149.21 320.217 148.565 321.65 147.276C323.083 145.843 323.871 143.98 324.014 141.687C324.301 139.395 324.444 137.03 324.444 134.594V85.3734C324.444 82.7942 324.301 80.4299 324.014 78.2805C323.871 75.9878 323.083 74.1966 321.65 72.907C320.217 71.4741 317.494 70.7576 313.482 70.7576C312.193 70.7576 310.975 70.6143 309.828 70.3278C308.825 69.8979 308.324 68.6083 308.324 66.4589C308.324 64.3095 309.47 63.0199 311.763 62.59C318.354 61.5869 323.369 60.5839 326.808 59.5809C330.391 58.5778 333.113 57.7181 334.976 57.0016C336.839 56.2851 338.487 55.8553 339.92 55.712C341.066 55.5687 341.997 55.7836 342.714 56.3568C343.573 56.9299 344.003 58.0763 344.003 59.7958V134.594C344.003 137.03 344.075 139.395 344.218 141.687C344.505 143.98 345.365 145.843 346.798 147.276C348.374 148.565 351.168 149.21 355.18 149.21C356.47 149.21 357.544 149.353 358.404 149.64C359.407 149.783 359.98 150.93 360.124 153.079C360.124 154.082 359.837 155.085 359.264 156.088C358.691 156.948 357.831 157.378 356.685 157.378C352.529 157.091 348.66 159.735 345.078 159.592C341.639 159.592 338.635 159.592 334.766 159.592C330.897 159.592 326.593 159.592 323.154 159.592C319.715 159.735 316.353 159.305 312.198 159.592ZM333.042 31.8538C329.029 31.8538 325.662 30.6358 322.939 28.1999C320.217 25.6206 318.856 22.4682 318.856 18.7426C318.856 15.4469 320.503 12.5094 323.799 9.93014C327.095 7.35088 330.82 6.06125 334.976 6.06125C338.558 6.06125 341.496 7.35088 343.788 9.93014C346.081 12.3661 347.227 15.5185 347.227 19.3874C347.227 22.8264 345.866 25.7639 343.144 28.1999C340.421 30.6358 337.054 31.8538 333.042 31.8538Z",
    "M283.411 159.592C279.112 159.592 275.028 159.312 271.16 157.163C267.291 155.013 264.067 151.718 261.487 147.276C259.051 142.834 257.833 137.245 257.833 130.51V67.3186L245.367 67.7485C244.364 67.7485 243.576 67.3903 243.003 66.6738C242.573 65.8141 242.358 64.8827 242.358 63.8796C242.358 61.0138 243.361 59.3659 245.367 58.936C250.669 57.933 254.681 56.2851 257.403 53.9925C260.126 51.5565 262.204 48.6907 263.637 45.3949C265.213 42.0992 266.646 38.5169 267.935 34.648C268.365 33.5017 269.01 32.7852 269.87 32.4986C270.73 32.0688 271.661 31.8538 272.664 31.8538C273.524 31.8538 274.455 32.0688 275.458 32.4986C276.605 32.9285 277.178 33.7166 277.178 34.863L275.673 59.3659L300.821 57.8613C302.111 57.7181 302.97 58.0763 303.4 58.936C303.83 59.7958 304.045 60.7988 304.045 61.9452C304.045 63.3781 303.758 64.811 303.185 66.2439C302.755 67.6768 302.182 68.3933 301.466 68.3933L277.393 67.7485V133.09C277.393 137.245 278.252 141.042 279.972 144.481C281.835 147.92 285.131 149.64 289.859 149.64C291.435 149.64 293.227 149.497 295.233 149.21C297.239 148.923 299.388 148.279 301.681 147.276C302.254 146.989 302.827 146.774 303.4 146.631C303.973 146.344 304.547 146.201 305.12 146.201C306.266 146.201 307.126 146.702 307.699 147.705C308.272 148.565 308.774 149.497 309.204 150.5C309.633 151.789 309.275 152.792 308.129 153.509C303.687 156.375 299.803 157.657 296.077 158.517C292.352 159.377 287.996 159.592 283.411 159.592Z",
    "M138.091 201.44C137.088 201.44 136.228 200.938 135.512 199.935C134.939 199.076 134.652 198.144 134.652 197.141C134.795 194.992 135.297 193.774 136.157 193.487C137.16 193.344 138.306 193.272 139.596 193.272C143.464 193.272 146.115 192.556 147.548 191.123C149.124 189.833 150.056 188.042 150.342 185.75C150.629 183.457 150.772 181.093 150.772 178.657V85.3734C150.772 82.7942 150.629 80.4299 150.342 78.2805C150.199 75.9878 149.411 74.1966 147.978 72.907C146.545 71.4741 143.823 70.7576 139.81 70.7576C138.521 70.7576 137.303 70.6143 136.157 70.3278C135.153 69.8979 134.652 68.6083 134.652 66.4589C134.652 64.3095 135.798 63.0199 138.091 62.59C144.682 61.5869 149.698 60.5839 153.137 59.5809C156.719 58.5778 159.37 57.7181 161.089 57.0016C162.952 56.2851 164.6 55.8553 166.033 55.712C167.179 55.5687 168.111 55.7836 168.827 56.3568C169.687 56.9299 170.117 58.0763 170.117 59.7958V70.1128H170.762C174.774 66.3872 179.574 63.2348 185.162 60.6555C190.751 58.0763 196.124 56.7867 201.283 56.7867C210.024 56.7867 217.761 58.936 224.496 63.2348C231.231 67.5336 236.533 73.5518 240.402 81.2896C244.27 88.8841 246.205 97.7682 246.205 107.942C246.205 118.259 243.841 127.286 239.112 135.024C234.383 142.762 228.293 148.78 220.842 153.079C213.391 157.234 205.438 159.312 196.984 159.312C190.536 159.312 185.306 158.596 181.294 157.163C177.425 155.873 174.057 154.369 171.191 152.649H170.332V178.657C170.332 181.093 170.475 183.457 170.762 185.75C171.048 188.042 171.98 189.833 173.556 191.123C175.132 192.556 177.783 193.272 181.508 193.272C182.798 193.272 183.873 193.344 184.733 193.487C185.736 193.774 186.309 194.992 186.452 197.141C186.452 198.144 186.165 199.076 185.592 199.935C185.019 200.938 184.159 201.44 183.013 201.44C178.858 201.153 174.989 200.938 171.406 200.795C167.967 200.795 164.313 200.795 160.445 200.795C156.576 200.795 152.922 200.795 149.483 200.795C146.044 200.938 142.246 201.153 138.091 201.44ZM195.265 152.004C200.853 152.004 205.51 150.643 209.235 147.92C212.961 145.055 215.899 141.472 218.048 137.174C220.341 132.731 221.917 128.003 222.777 122.988C223.78 117.829 224.281 113.029 224.281 108.587C224.281 101.852 223.206 95.4039 221.057 89.2423C219.051 82.9375 215.755 77.7789 211.17 73.7668C206.728 69.6113 200.853 67.5336 193.545 67.5336C188.1 67.5336 183.586 68.6799 180.004 70.9726C176.422 73.122 173.198 75.7012 170.332 78.7104V136.314C171.908 140.039 174.774 143.622 178.929 147.061C183.228 150.356 188.673 152.004 195.265 152.004Z",
    "M68.5653 161.032C58.1049 161.032 48.6477 159.097 40.1934 155.228C31.7392 151.359 24.5029 146.129 18.4847 139.538C12.4664 132.946 7.88106 125.495 4.72864 117.184C1.57621 108.73 0 99.9176 0 90.7469C0 78.8536 2.00609 68.3217 6.01827 59.151C10.1737 49.9803 15.6188 42.2425 22.3536 35.9376C29.0883 29.6328 36.4678 24.9042 44.4922 21.7517C52.6598 18.456 60.6842 16.8082 68.5653 16.8082C79.3122 16.8082 88.9127 18.7426 97.367 22.6115C105.964 26.4804 113.272 31.7105 119.291 38.302C125.309 44.8934 129.894 52.4162 133.047 60.8705C136.199 69.1814 137.775 77.8506 137.775 86.878C137.775 98.7712 135.698 109.303 131.542 118.474C127.387 127.645 121.87 135.382 114.992 141.687C108.114 147.992 100.591 152.792 92.4234 156.088C84.399 159.384 76.4463 161.032 68.5653 161.032ZM68.3503 151.574C78.524 151.574 86.835 148.565 93.2831 142.547C99.7313 136.529 104.46 128.648 107.469 118.904C110.621 109.017 112.198 98.3414 112.198 86.878C112.198 76.1311 110.55 66.1723 107.254 57.0016C104.102 47.6876 99.3014 40.2364 92.8533 34.648C86.4051 28.9163 78.2375 26.0505 68.3503 26.0505C58.3199 26.0505 50.0806 29.0596 43.6324 35.0779C37.3276 40.9529 32.6706 48.7623 29.6615 58.5062C26.6523 68.1067 25.1478 78.6387 25.1478 90.1021C25.1478 100.849 26.6523 110.951 29.6615 120.408C32.8139 129.722 37.6142 137.245 44.0623 142.977C50.5105 148.709 58.6065 151.574 68.3503 151.574Z"
  ];

  // ------------------------------------------------------------------ design-system colours
  const CREAM = [255, 252, 247], FOREST = [44, 78, 37], SAGE = [135, 164, 130], STONE = [190, 186, 177];
  const THEMES = {
    light: { dot: FOREST, word: FOREST, ring: FOREST, start: STONE, halo: SAGE },
    dark: { dot: [206, 224, 196], word: CREAM, ring: CREAM, start: STONE, halo: SAGE }
  };

  // ------------------------------------------------------------------ easing (identical to anim.py)
  function clamp(x, a = 0, b = 1) { return Math.max(a, Math.min(b, x)); }
  function bezier(p1x, p1y, p2x, p2y) {
    return (x) => {
      x = clamp(x);
      let t = x;
      for (let i = 0; i < 8; i++) {            // Newton on x(t)
        const cx = 3 * p1x * (1 - t) * (1 - t) * t + 3 * p2x * (1 - t) * t * t + t * t * t;
        const dx = 3 * p1x * (1 - t) * (1 - t) + 6 * (p2x - p1x) * (1 - t) * t + 3 * (1 - p2x) * t * t;
        if (Math.abs(dx) < 1e-6) break;
        t = clamp(t - (cx - x) / dx);
      }
      return 3 * p1y * (1 - t) * (1 - t) * t + 3 * p2y * (1 - t) * t * t + t * t * t;
    };
  }
  const easeStd = bezier(0.2, 0.7, 0.2, 1.0);   // design-system standard curve
  const easeIO = bezier(0.65, 0.0, 0.35, 1.0);  // gentle in-out
  function easeOut(x, p) { return 1 - Math.pow(1 - clamp(x), p || 3); }
  function seg(t, t0, dur) { return clamp((t - t0) / dur); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function mix(c1, c2, u) { u = clamp(u); return [0, 1, 2].map((i) => Math.round(lerp(c1[i], c2[i], u))); }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  // ------------------------------------------------------------------ choreography
  // Each returns the full visual state at time t: { ring, dots: [{x, y, r, col, a, halo}], word }
  const TAU = Math.PI * 2;

  function flight(start, end, u) {              // quadratic arc: the curved glide into the slot
    const mx = (start[0] + end[0]) / 2, my = (start[1] + end[1]) / 2;
    const px = -(end[1] - start[1]) * 0.22, py = (end[0] - start[0]) * 0.22;
    return [(1 - u) * (1 - u) * start[0] + 2 * (1 - u) * u * (mx + px) + u * u * end[0],
            (1 - u) * (1 - u) * start[1] + 2 * (1 - u) * u * (my + py) + u * u * end[1]];
  }

  // stage: exactly anim.py into_range() — units are output px of a frame whose short side is 1080
  function stageScene(W, H) {
    const cw = CONTENT[2] - CONTENT[0], ch = CONTENT[3] - CONTENT[1];
    const S = Math.min(0.47 * W / cw, 0.30 * H / ch);
    const ox = W / 2 - (CONTENT[0] + cw / 2) * S, oy = H / 2 - (CONTENT[1] + ch / 2) * S;
    return { W: W, H: H, S: S, ox: ox, oy: oy, ring: [ox + RING[0] * S, oy + RING[1] * S], intro: [W / 2, H / 2], k0: 1.9 };
  }

  function stageFrame(sc, t, pal) {
    const lock = easeStd(seg(t, 3.1, 0.85));
    const cx = lerp(sc.intro[0], sc.ring[0], lock), cy = lerp(sc.intro[1], sc.ring[1], lock), k = lerp(sc.k0, 1, lock);
    const out = { ring: { x: cx, y: cy, r: RING_R * sc.S * k, a: (120 / 255) * (1 - seg(t, 2.75, 0.35)),
                        p: easeIO(seg(t, 0.25, 0.9)), w: 2 }, dots: [] };
    ORDER.forEach((i, ki) => {
      const d = DOTS[i], dx = (d[0] - RING[0]) * sc.S, dy = (d[1] - RING[1]) * sc.S, r = d[2] * sc.S;
      const t0 = 0.95 + ki * 0.17, dur = 0.8;
      const wob = [9 * Math.sin(TAU * 0.33 * t + i), 7 * Math.cos(TAU * 0.29 * t + 2 * i)];
      const start = [sc.intro[0] + STAGE_SCATTER[i][0] + wob[0], sc.intro[1] + STAGE_SCATTER[i][1] + wob[1]];
      const u = easeIO(seg(t, t0, dur));
      const p = flight(start, [cx + dx * k, cy + dy * k], u);
      const rad = lerp(r * sc.k0 * 0.62, r * k, u);
      const v = seg(t, t0 + dur - 0.05, 0.42);    // arrival halo: "in range"
      out.dots.push({ x: p[0], y: p[1], r: rad, a: Math.floor(255 * easeOut(seg(t, 0.05 * ki, 0.4))) / 255,
                      col: u < 0.55 ? pal.start : mix(pal.start, pal.dot, (u - 0.55) / 0.45),
                      halo: v > 0 && v < 1 ? { r: rad * (1.12 + 0.6 * easeOut(v)), a: (120 / 255) * (1 - v), w: 1.6 } : null });
    });
    const e = easeStd(seg(t, 3.45, 0.95));
    out.word = { s: sc.S, x: sc.ox, y: sc.oy + 16 * (1 - e), left: sc.ox + TEXT_X0 * sc.S, w: TEXT_W * sc.S,
                 feather: 110, e: e };
    return out;
  }

  // inline: the same motion language, formed in place (units are logo px; lockup never moves)
  function inlineFrame(t, pal) {
    const out = { ring: { x: RING[0], y: RING[1], r: RING_R, a: (120 / 255) * (1 - seg(t, 2.3, 0.35)),
                        p: easeIO(seg(t, 0.2, 0.8)), w: 3.5 }, dots: [] };
    ORDER.forEach((i, ki) => {
      const d = DOTS[i], t0 = 0.55 + ki * 0.15, dur = 0.75;
      const wob = [14 * Math.sin(TAU * 0.33 * t + i), 11 * Math.cos(TAU * 0.29 * t + 2 * i)];
      const start = [INLINE_SCATTER[i][0] + wob[0], INLINE_SCATTER[i][1] + wob[1]];
      const u = easeIO(seg(t, t0, dur));
      const p = flight(start, [d[0], d[1]], u);
      const rad = lerp(d[2] * 0.62, d[2], u);
      const v = seg(t, t0 + dur - 0.05, 0.42);
      out.dots.push({ x: p[0], y: p[1], r: rad, a: easeOut(seg(t, 0.05 * ki, 0.4)),
                      col: u < 0.55 ? pal.start : mix(pal.start, pal.dot, (u - 0.55) / 0.45),
                      halo: v > 0 && v < 1 ? { r: rad * (1.12 + 0.6 * easeOut(v)), a: (120 / 255) * (1 - v), w: 2.8 } : null });
    });
    const e = easeStd(seg(t, 2.35, 0.95));
    out.word = { s: 1, x: 0, y: 28 * (1 - e), left: TEXT_X0, w: TEXT_W, feather: 195, e: e };
    return out;
  }

  const DURATION = { stage: 5.8, inline: 3.3 };

  // ------------------------------------------------------------------ element
  const SVGNS = 'http://www.w3.org/2000/svg';
  let uid = 0, colourCtx = null;
  function node(tag, a, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in a) n.setAttribute(k, a[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function attrs(n, a) { for (const k in a) n.setAttribute(k, a[k]); }
  function parseColour(str, fallback) {
    str = (str || '').trim();
    if (!str) return fallback;
    colourCtx = colourCtx || document.createElement('canvas').getContext('2d');
    colourCtx.fillStyle = '#000';
    colourCtx.fillStyle = str;
    const v = colourCtx.fillStyle;
    if (v.charAt(0) === '#') return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
    const m = v.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : fallback;
  }
  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  const style = document.createElement('style');
  style.textContent =
    'optimal-logo{display:block;aspect-ratio:1600/375}' +
    'optimal-logo[variant="stage"]{aspect-ratio:16/9}' +
    'optimal-logo>svg{display:block;width:100%;height:100%;overflow:visible}';
  document.head.appendChild(style);

  class OptimalLogo extends HTMLElement {
    static get observedAttributes() { return ['variant', 'theme']; }

    get variant() { return this.getAttribute('variant') === 'stage' ? 'stage' : 'inline'; }
    get duration() { return DURATION[this.variant]; }
    get currentTime() { return this._t || 0; }

    connectedCallback() {
      if (!this._svg) this._build();
      this._arm();
    }

    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      if (this._io) this._io.disconnect();
      if (this._ro) this._ro.disconnect();
      this._io = this._ro = null;
    }

    attributeChangedCallback() {
      if (!this._svg) return;
      this._build();
      this._render(this._t || 0);
    }

    /** Plays the animation from the start. */
    play() {
      const speed = parseFloat(this.getAttribute('speed')) || 1, dur = this.duration;
      let start = null;
      this._disarm();
      cancelAnimationFrame(this._raf);
      if (!this._svg) this._build();
      if (reducedMotion()) { this.finish(); return; }
      const tick = (now) => {
        if (start === null) start = now;
        const t = Math.min((now - start) / 1000 * speed, dur);
        this._render(t);
        if (t < dur) this._raf = requestAnimationFrame(tick);
        else this.dispatchEvent(new CustomEvent('optimal-logo-done', { bubbles: true }));
      };
      this._raf = requestAnimationFrame(tick);
    }

    /** Stops and shows the frame at `t` seconds. */
    seek(t) {
      this._disarm();
      cancelAnimationFrame(this._raf);
      if (!this._svg) this._build();
      this._render(clamp(+t || 0, 0, this.duration));
    }

    /** Stops on the finished logo. */
    finish() { this.seek(this.duration); }

    _palette() {
      const base = THEMES[this.getAttribute('theme') === 'dark' ? 'dark' : 'light'];
      const cs = getComputedStyle(this), pal = {};
      for (const key in base) pal[key] = parseColour(cs.getPropertyValue('--optimal-logo-' + key), base[key]);
      return pal;
    }

    _build() {
      const id = 'optimal-logo-' + (++uid);
      this.textContent = '';
      this._pal = this._palette();
      const svg = node('svg', { role: 'img', 'aria-label': 'Optimal', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' });
      const defs = node('defs', {}, svg);
      const grad = node('linearGradient', { id: id + '-wipe', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
      node('stop', { offset: 0, 'stop-color': '#fff' }, grad);
      node('stop', { offset: 1, 'stop-color': '#000' }, grad);
      const mask = node('mask', { id: id + '-mask', maskUnits: 'userSpaceOnUse', x: -1e4, y: -1e4, width: 3e4, height: 3e4 }, defs);
      node('rect', { x: -1e4, y: -1e4, width: 3e4, height: 3e4, fill: 'url(#' + id + '-wipe)' }, mask);

      // draw order matches anim.py: ring, then each dot followed by its arrival halo, then the wordmark
      this._ring = node('circle', { fill: 'none' }, svg);
      this._dots = ORDER.map(() => ({ disc: node('circle', {}, svg), halo: node('circle', { fill: 'none' }, svg) }));
      this._wordOuter = node('g', { mask: 'url(#' + id + '-mask)' }, svg);
      this._word = node('g', { fill: rgb(this._pal.word) }, this._wordOuter);
      WORDMARK.forEach((d) => node('path', { d }, this._word));
      this._grad = grad;
      this._svg = svg;
      this.appendChild(svg);

      if (this.variant === 'stage') {
        this._scene = null;
        this._fit();
        if (window.ResizeObserver && !this._ro) {
          this._ro = new ResizeObserver(() => { if (this._fit()) this._render(this._t || 0); });
          this._ro.observe(this);
        }
      } else {
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
        svg.setAttribute('viewBox', BOX.join(' '));
      }
    }

    // stage frames keep a 1080-unit short side, like the 1920x1080 / 1080x1920 / 1080x1080 video masters
    _fit() {
      const r = this.getBoundingClientRect();
      const aspect = r.width > 0 && r.height > 0 ? r.width / r.height : 16 / 9;
      const W = aspect >= 1 ? 1080 * aspect : 1080, H = aspect >= 1 ? 1080 : 1080 / aspect;
      if (this._scene && Math.abs(this._scene.W - W) < 0.5 && Math.abs(this._scene.H - H) < 0.5) return false;
      this._scene = stageScene(W, H);
      this._svg.setAttribute('viewBox', '0 0 ' + W.toFixed(2) + ' ' + H.toFixed(2));
      return true;
    }

    _render(t) {
      this._t = t;
      const pal = this._pal;
      const f = this.variant === 'stage' ? stageFrame(this._scene, t, pal) : inlineFrame(t, pal);
      // target ring (PIL draws outlines inside the box, so the stroke centre sits half a width in)
      const ring = f.ring, rr = Math.max(ring.r - ring.w / 2, 0), circ = TAU * rr;
      attrs(this._ring, {
        cx: ring.x, cy: ring.y, r: rr, stroke: rgb(pal.ring), 'stroke-width': ring.w,
        'stroke-opacity': ring.a > 0 && ring.p > 0 ? ring.a : 0,
        'stroke-dasharray': circ * ring.p + ' ' + circ,
        transform: 'rotate(-90 ' + ring.x + ' ' + ring.y + ')'
      });
      f.dots.forEach((d, n) => {
        const el = this._dots[n];
        attrs(el.disc, { cx: d.x, cy: d.y, r: Math.max(d.r, 0), fill: rgb(d.col), 'fill-opacity': d.a });
        if (d.halo) {
          attrs(el.halo, { cx: d.x, cy: d.y, r: Math.max(d.halo.r - d.halo.w / 2, 0), stroke: rgb(pal.halo),
                           'stroke-width': d.halo.w, 'stroke-opacity': d.halo.a });
        } else {
          el.halo.setAttribute('stroke-opacity', 0);
        }
      });
      // wordmark: soft left-to-right wipe + small rise (anim.py Scene.wordmark)
      const w = f.word, edge = w.left + w.e * (w.w + w.feather), s = w.s * WORD_S;
      attrs(this._grad, { x1: edge - w.feather, x2: edge });
      this._wordOuter.setAttribute('opacity', w.e > 0 ? clamp(w.e * 1.4) : 0);
      this._word.setAttribute('transform', 'matrix(' + s + ' 0 0 ' + s + ' ' + (w.x + WORD_X * w.s) + ' ' + (w.y + WORD_Y * w.s) + ')');
    }

    // explicit play / seek / finish takes over from the scroll trigger
    _disarm() {
      if (this._io) { this._io.disconnect(); this._io = null; }
    }

    _arm() {
      const mode = this.getAttribute('play') || 'visible';
      if (reducedMotion() || mode === 'manual') { this.finish(); return; }
      if (mode === 'load') { this.play(); return; }
      this._render(0);
      if (!window.IntersectionObserver) { this.play(); return; }
      this._io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        this._io.disconnect(); this._io = null;
        this.play();
      }, { threshold: 0.6 });                   // most of it on screen, so the whole move is seen
      this._io.observe(this);
    }
  }

  customElements.define('optimal-logo', OptimalLogo);
})();
