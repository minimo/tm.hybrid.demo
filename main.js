tm.main(function() {
    var app = tm.hybrid.Application("#canvas2d", "#canvas3d");
    app.resize(640, 960).fitWindow().run();
    
    app.replaceScene(tm.game.LoadingScene({
        width: 640, height: 960,
        assets: {
            hiyoko: "assets/hiyoco_nomal_full.png",
        },
        nextScene: KiraraOnStage,
    }));
});

tm.define("KiraraOnStage", {
    superClass: "tm.hybrid.Scene", // tm.app.Sceneの3D向け拡張
    init: function() {
        this.superInit();

        // カメラ調整
        this.camera.setPosition(0, 0, 2000);
        this.camera.lookAt(new THREE.Vector3(0, 10, 0));
        
        // ライトを動かす
        this.directionalLight.setPosition(0, 100, -80);
/*
        this.directionalLight
            .on("enterframe", function(e) {
                var f = e.app.frame;
                this.x = Math.cos(f * 0.1) * 10;
                this.z = Math.sin(f * 0.1) * 10;
            });
*/

        var sx = 20, sy = 20;
        var texture = THREE.ImageUtils.loadTexture('assets/tmlib_logo.png');
        var geometry = new THREE.PlaneGeometry(1000, 1000, sx, sy);

        this.shaderUniforms = {
            curlR: {type: 'f', value: 0.0},
            texture: {type: 't', value: texture},
        }
        var material = new THREE.ShaderMaterial({
                vertexShader: document.getElementById('vertexShader').textContent,
                fragmentShader: document.getElementById('fragmentShader').textContent,
                uniforms: this.shaderUniforms,
            });
        material.side = THREE.DoubleSide;
        material.transparent = true;
        material.blending = THREE.NormalBlending;

        this.planeMesh = new THREE.Mesh(geometry, material);

        // メッシュを表示する
        var kirara = tm.hybrid.Mesh(this.planeMesh)
            .addChildTo(this)
            .setPosition(0, 0, 0)
            .on("enterframe", function() {
                if (this.rolling) this.rotationY += 5; // Y軸回転
            });
        kirara.rolling = false;

        // 2Dスプライトとの併用も可能
        var hiyoko = tm.display.Sprite("hiyoko", 32, 32)
            .setScale(4)
            .setFrameIndex(0)
            .addChildTo(this)
            .on("enterframe", function() {
                this.x += this.vx * 10;
                this.y += this.vy * 10;
                if (this.x < 0 || 640 < this.x) this.vx *= -1;
                if (this.y < 0 || 960 < this.y) this.vy *= -1;
                
                this.frameIndex = (this.frameIndex + 1) % 4;
                this.rotation += 2;
            });
        hiyoko.vx = 1;
        hiyoko.vy = 1;

        tm.ui.FlatButton({ text: "かいてん" })
            .setPosition(320, 100)
            .addChildTo(this)
            .on("push", function() {
                kirara.rolling = !kirara.rolling;
                this.label.text = kirara.rolling ? "とまる" : "かいてん";
            });
        this.time = 0;
    },
    update: function(e) {
        var time = this.time++;
        var _curlR = 300.0 + 150.0 * Math.sin(time*0.1);
        this.shaderUniforms.curlR.value = _curlR;
    },
});
