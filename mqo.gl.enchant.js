/**
 * phi
 */

_modelurl = "";

if( enchant.gl != undefined ){
    enchant.Game.prototype._original_load = enchant.Game.prototype.load;
    enchant.Game.prototype.load = function(src, callback){
        var ext = src.match(/\.\w+$/)[0];
        if( ext )ext = ext.slice(1).toLowerCase();
        if( ext == 'mqo' ){
            if( callback == null )callback = function(){};
            enchant.gl.Sprite3D.loadMqo(src, function(mqo){
                enchant.Game.instance.assets[src] = mqo;
                callback();
            });
        }else{
            this._original_load(src, callback);
        }
    };
    (function(){
        /**
         *  メタセコイア形式をロード
         */
        enchant.gl.Sprite3D.loadMqo = function(url, onload) {
            MqoLoader.load(url, onload);
        };
        /**
         *  メタセコイア形式をデータからロード
         */
        enchant.gl.Sprite3D.loadMqoFromData = function(data, onload) {
            MqoLoader.loadFromData(data, onload);
        };

        /**
         *  メタセコローダ
         */
        var MqoLoader = {
            /**
             *  URLからロード
             */
            load:function(url, onload){
                var self = this;
                _modelurl = url.split("/");
                var req = new XMLHttpRequest();
                req.open("GET", url, true);
                req.onload = function(){
                    var data = req.responseText;
                    self.loadFromData(data, onload);
                };
                req.send(null);
            },

            /**
             *  データからロード
             */
            loadFromData:function(data, onload){
                var mqoModel= new MqoModel();
                var model   = null;

                mqoModel.parse(data);
                model = mqoModel.convert();

                onload(model);  //アセットに登録

                return model;
            },
        };

        /**
         *  メタセコモデル
         */
        var MqoModel = function()
        {
            this.meshes     = Array();
            this.material   = null;
        };
        MqoModel.prototype = {
            /**
             *  パース
             */
            parse:function(text){
                // オブジェクトをパース
                var objectTextList = text.match(/^Object [\s\S]*?^\}/gm);
                for( var i = 0, len = objectTextList.length; i < len; ++i ){
                    var objectText = objectTextList[i];
                    var mesh = new MqoMesh();
                    mesh.parse(objectText);
                    this.meshes.push(mesh);
                }

                // マテリアル
                var materialText = text.match(/^Material [\s\S]*?^\}/m);
                this.material = new MqoMaterial();
                if( materialText ){
                    this.material.parse(materialText[0]);   //最初のマテリアルリストのみ読み込み
                }
            },

            /**
             *  コンバート
             */
            convert:function(){
                var root = new Sprite3D();
                for( var i=0, len=this.meshes.length; i<len; ++i ){
                    this.meshes[i].convert(root,this.material); //ルートに追加します
                }
                return root;
            },
        };

        /**
         *  メタセコメッシュ
         */
        var MqoMesh = function(){
            this.vertices   = [];   // 頂点
            this.faces      = [];   // 面情報
            this.vertNorms  = [];   // 頂点法線

            this.facet  = 59.5;     // スムージング角度
            this.mirror = 0;
            this.mirrorAxis = 0;
        };

        MqoMesh.prototype = {
            /**
             *  パース
             */
            parse:function(text){
                //オブジェクト名
                var nm = text.split(' ');   //オブジェクト名取得
                this.name = nm[1].replace(/"/g, "");

                // スムージング角
                var facet = text.match(/facet ([0-9\.]+)/);
                if( facet ){ this.facet = Number(facet[1]); }

                // 可視フラグ
                var visible = text.match(/visible ([0-9\.]+)/);
                if( visible ){ this.visible = Number(visible[1]); }

                // ミラー
                var mirror = text.match(/mirror ([0-9])/m);
                if( mirror ){
                this.mirror = Number(mirror[1]);
                    // 軸
                    var mirrorAxis = text.match(/mirror_axis ([0-9])/m);
                    if( mirrorAxis ){
                        this.mirrorAxis = Number(mirrorAxis[1]);
                    }
                }

                //頂点情報
                var vertex_txt = text.match(/vertex ([0-9]+).+\{\s([\w\W]+)}$/gm);
                this._parseVertices( RegExp.$1, RegExp.$2 );

                //フェース情報
                var face_txt = text.match(/face ([0-9]+).+\{\s([\w\W]+)}$/gm);
                this._parseFaces( RegExp.$1, RegExp.$2 );
            },

            /**
             *  メッシュへコンバート
             *  root:ルートオブジェクト
             *  materials:マテリアルリスト
             */
            convert:function(root,materials){

                //不可視設定の場合は処理をスキップ
                if( this.visible == 0 ){
                    return;
                }

                //フェースが使用するマテリアルを調べる
                var facemat = [];
                facemat[facemat.length] = this.faces[0].m[0];
                for( var i = 0,lf = this.faces.length; i < lf; ++i ){
                    var fm = -1;
                    for( var j=0,lfm=facemat.length; j<lfm; ++j ){
                        if( facemat[j] != this.faces[i].m[0] )fm = this.faces[i].m[0];
                    }
                    if( fm != -1 )facemat[facemat.length] = fm;
                }

                //使用マテリアルに応じてオブジェクトを分割変換
                for( var mn = 0; mn < facemat.length; mn++ ){
                    var matnum = facemat[mn];
                    var sp = this.convertWithMaterial(materials.materialList[matnum],matnum);
                    if( sp )root.addChild(sp);
                }
            },
            /**
             *  オブジェクトからマテリアルに対応したメッシュを作る
             *  material:使用するマテリアル
             *  num:マテリアル番号
             */
            convertWithMaterial:function(material,num){
                var vertices = [];  //　頂点
                var normals  = [];  //　面法線
                var uv       = [];  //　テクスチャＵＶ
                var indices  = [];  //　インデックス
                var colors   = [];  //　頂点色

                // チェック
                var smoothingValue = Math.cos(this.facet*Math.PI/180);
                var checkVertexNormalize = function(n,vn)
                {
                    var c = n[0]*vn[0] + n[1]*vn[1] + n[2]*vn[2];
                    return (c > smoothingValue) ? vn : n;
                };
                // indices と uv を作成
                for( var i = 0,lf = this.faces.length; i < lf; ++i ){
                    var face    = this.faces[i];
                    if( face.m[0] != num )continue; //フェースのマテリアル番号が違う場合はスキップ

                    var vIndex  = face.v;
                    var mat     = material;//materials.materialList[num];
                    var index   = vertices.length/3;

                    //面の頂点数が３の場合
                    if( face.vNum == 3 ){
                        // 頂点インデックス
                        indices.push( index+0, index+1, index+2 );

                        // 頂点リスト
                        vertices.push.apply(vertices, this.vertices[ vIndex[0] ]);
                        vertices.push.apply(vertices, this.vertices[ vIndex[2] ]);
                        vertices.push.apply(vertices, this.vertices[ vIndex[1] ]);
 
                        // カラーを設定
                        colors.push(
                            mat.col[0], mat.col[1], mat.col[2], mat.col[3],
                            mat.col[0], mat.col[1], mat.col[2], mat.col[3],
                            mat.col[0], mat.col[1], mat.col[2], mat.col[3]
                        );

                        // 法線
                        var n = face.n;
                        // 頂点法線
                        var vn0 = this.vertNorms[ vIndex[0] ];
                        var vn1 = this.vertNorms[ vIndex[1] ];
                        var vn2 = this.vertNorms[ vIndex[2] ];

                        // ターゲットとなる法線
                        var tn0 = checkVertexNormalize(n, vn0);
                        var tn1 = checkVertexNormalize(n, vn1);
                        var tn2 = checkVertexNormalize(n, vn2);

                        normals.push( tn0[0], tn0[1], tn0[2] );
                        normals.push( tn2[0], tn2[1], tn2[2] );
                        normals.push( tn1[0], tn1[1], tn1[2] );

                        // UV
                        uv.push(face.uv[0], 1-face.uv[1]);
                        uv.push(face.uv[4], 1-face.uv[5]);
                        uv.push(face.uv[2], 1-face.uv[3]);
                    }else if( face.vNum == 4 ){
                        // 頂点インデックスリスト
                        indices.push( index+0, index+1, index+2, index+3, index+4, index+5 );

                        // 頂点リスト
                        vertices.push( this.vertices[ vIndex[0] ][0], this.vertices[ vIndex[0] ][1], this.vertices[ vIndex[0] ][2] );
                        vertices.push( this.vertices[ vIndex[3] ][0], this.vertices[ vIndex[3] ][1], this.vertices[ vIndex[3] ][2] );
                        vertices.push( this.vertices[ vIndex[1] ][0], this.vertices[ vIndex[1] ][1], this.vertices[ vIndex[1] ][2] );

                        vertices.push( this.vertices[ vIndex[2] ][0], this.vertices[ vIndex[2] ][1], this.vertices[ vIndex[2] ][2] );
                        vertices.push( this.vertices[ vIndex[1] ][0], this.vertices[ vIndex[1] ][1], this.vertices[ vIndex[1] ][2] );
                        vertices.push( this.vertices[ vIndex[3] ][0], this.vertices[ vIndex[3] ][1], this.vertices[ vIndex[3] ][2] );

                        // カラーリスト
                        colors.push(
                            mat.col[0], mat.col[1], mat.col[2], mat.col[3],
                            mat.col[0], mat.col[1], mat.col[2], mat.col[3],
                            mat.col[0], mat.col[1], mat.col[2], mat.col[3],
                            mat.col[0], mat.col[1], mat.col[2], mat.col[3],
                            mat.col[0], mat.col[1], mat.col[2], mat.col[3],
                            mat.col[0], mat.col[1], mat.col[2], mat.col[3]
                        );

                        // 法線
                        var n = face.n;
                        // 頂点法線
                        var vn0 = this.vertNorms[ vIndex[0] ];
                        var vn1 = this.vertNorms[ vIndex[1] ];
                        var vn2 = this.vertNorms[ vIndex[2] ];
                        var vn3 = this.vertNorms[ vIndex[3] ];

                        // ターゲットとなる法線
                        var tn0 = checkVertexNormalize(n, vn0);
                        var tn1 = checkVertexNormalize(n, vn1);
                        var tn2 = checkVertexNormalize(n, vn2);
                        var tn3 = checkVertexNormalize(n, vn3);

                        normals.push( tn0[0], tn0[1], tn0[2] );
                        normals.push( tn3[0], tn3[1], tn3[2] );
                        normals.push( tn1[0], tn1[1], tn1[2] );

                        normals.push( tn2[0], tn2[1], tn2[2] );
                        normals.push( tn1[0], tn1[1], tn1[2] );
                        normals.push( tn3[0], tn3[1], tn3[2] );

                        // UV
                        uv.push(face.uv[0], 1-face.uv[1]);
                        uv.push(face.uv[6], 1-face.uv[7]);
                        uv.push(face.uv[2], 1-face.uv[3]);

                        uv.push(face.uv[4], 1-face.uv[5]);
                        uv.push(face.uv[2], 1-face.uv[3]);
                        uv.push(face.uv[6], 1-face.uv[7]);
                    }
                }

                // カラー配列作成(単色白)
                /*
                for (var i=0; i<vertices.length/3; ++i) {
                    colors[colors.length] = 1;
                    colors[colors.length] = 1;
                    colors[colors.length] = 1;
                    colors[colors.length] = 1;
                }
                */

                // スプライト3D生成
                var sprite  = new Sprite3D();
                sprite.mesh = new Mesh();
                sprite.mesh.vertices    = vertices;
                sprite.mesh.colors      = colors;
                sprite.mesh.normals     = normals;
                sprite.mesh.texCoords   = uv;
                sprite.mesh.indices     = indices;

                // マテリアルを設定
                // テクスチャ取得
                if( mat.tex ) {
                    var tex = "";
                    for( var i = 0; i < _modelurl.length-1; i++ ){
                        tex+=_modelurl[i]+"/";
                    }
                    tex+=mat.tex;
                    sprite.mesh.texture = new Texture(tex);
                    console.log(mat.tex);
                }

                sprite.mesh.texture.ambient     = [mat.col[0]*mat.amb ,mat.col[1]*mat.amb, mat.col[2]*mat.amb, 1];
                sprite.mesh.texture.shininess   = 50;
                sprite.mesh.texture.emission    = [mat.col[0]*mat.emi, mat.col[1]*mat.emi, mat.col[2]*mat.emi, 1];
                sprite.mesh.texture.specular    = [mat.col[0]*mat.spc, mat.col[1]*mat.spc, mat.col[2]*mat.spc, 1];

                return sprite;
            },
            /**
             *  頂点情報のパース
             */
            _parseVertices: function(num, text) {
                var vertexTextList = text.split('\n');
                for (var i=1; i<=num; ++i) {
                    var vertex = vertexTextList[i].split(' ');
                    vertex[0] = Number(vertex[0])*0.01;
                    vertex[1] = Number(vertex[1])*0.01;
                    vertex[2] = Number(vertex[2])*0.01;
                    this.vertices.push( vertex );
                }
                
                if (this.mirror) {
                    var self = this;
                    var toMirror = (function(){
                        return {
                            1: function(v) { return [ v[0]*-1, v[1], v[2] ]; },
                            2: function(v) { return [ v[0], v[1]*-1, v[2] ]; },
                            4: function(v) { return [ v[0], v[1], v[2]*-1 ]; },
                        }[self.mirrorAxis];
                    })();
                    
                    var len = this.vertices.length;
                    for (var i=0; i<len; ++i) {
                        this.vertices.push(
                            toMirror( this.vertices[i] )
                        );
                    }
                }
            },
            /**
             *  フェース情報のパース
             */
            _parseFaces: function(num, text) {
                var faceTextList = text.split('\n');

                var calcNormalize = function(a, b, c)
                {
                    var v1 = [ a[0] - b[0], a[1] - b[1], a[2] - b[2] ];
                    var v2 = [ c[0] - b[0], c[1] - b[1], c[2] - b[2] ];
                    var v3 = [
                        v1[1]*v2[2] - v1[2]*v2[1],
                        v1[2]*v2[0] - v1[0]*v2[2],
                        v1[0]*v2[1] - v1[1]*v2[0]
                    ];
                    var len = Math.sqrt(v3[0]*v3[0] + v3[1]*v3[1] + v3[2]*v3[2]);
                    v3[0] /= len;
                    v3[1] /= len;
                    v3[2] /= len;

                    return v3;
                };

                for( var i=1; i<=num; ++i ){
                    // トリムっとく
                    var faceText = faceTextList[i].replace(/^\s+|\s+$/g, "");
                    // 面の数
                    var vertex_num = Number(faceText[0]);

                    var info = faceText.match(/([A-Za-z]+)\(([\w\s\-\.\(\)]+?)\)/gi);
                    var face = { vNum: vertex_num };
                    
                    for (var j=0,len=info.length; j<len; ++j) {
                        var m = info[j].match(/([A-Za-z]+)\(([\w\s\-\.\(\)]+?)\)/);
                        var key = m[1].toLowerCase();
                        var value = m[2].split(" ");
                        value.forEach(function(elm, i, arr){
                            arr[i] = Number(elm);
                        });
                        face[key] = value;
                    }
                    
                    // UV デフォルト値
                    if( !face.uv ){
                        face.uv = [0, 0, 0, 0, 0, 0, 0, 0];
                    }

                    // マテリアル デフォルト値
                    if( !face.m )face.m = [undefined];

                    // 法線（面の場合のみ）
                    if( face.v.length > 2 ){
                        face.n = calcNormalize( this.vertices[face.v[0]], this.vertices[face.v[1]], this.vertices[face.v[2]] );
                    }

                    this.faces.push(face);
                }

                // ミラー対応
                if( this.mirror ){
                    var swap = function(a,b){ var temp=this[a]; this[a]=this[b]; this[b]=temp; return this; };
                    var len = this.faces.length;
                    var vertexOffset = (this.vertices.length/2);
                    for(var i=0; i<len; ++i) {
                        var targetFace = this.faces[i];
                        var face = {
                            uv  : [],
                            v   : [],
                            vNum: targetFace.vNum,
                        };
                        for (var j=0; j<targetFace.v.length; ++j) { face.v[j] = targetFace.v[j] + vertexOffset; }
                        for (var j=0; j<targetFace.uv.length; ++j) { face.uv[j] = targetFace.uv[j]; }

                        if (face.vNum == 3) {
                            swap.call(face.v, 1, 2);
                        }
                        else {
                            swap.call(face.v, 0, 1);
                            swap.call(face.v, 2, 3);
                        }

                        face.n = targetFace.n;
                        face.m = targetFace.m;

                        this.faces.push(face);
                    }
                }

                // 頂点法線を求める
                var vertNorm = Array(this.vertices.length);
                for (var i=0,len=this.vertices.length; i<len; ++i) vertNorm[i] = [];

                for (var i=0; i<this.faces.length; ++i) {
                    var face    = this.faces[i];
                    var vIndices  = face.v;

                    for (var j=0; j<face.vNum; ++j) {
                        var index = vIndices[j];
                        vertNorm[ index ].push.apply(vertNorm[ index ], face.n);
                    }
                }

                for (var i=0; i<vertNorm.length; ++i) {
                    var vn = vertNorm[i];
                    var result = [0, 0, 0];
                    var len = vn.length/3;
                    for (var j=0; j<len; ++j) {
                        result[0] += vn[j*3+0];
                        result[1] += vn[j*3+1];
                        result[2] += vn[j*3+2];
                    }

                    result[0] /= len;
                    result[1] /= len;
                    result[2] /= len;

                    var len = Math.sqrt(result[0]*result[0] + result[1]*result[1] + result[2]*result[2]);
                    result[0] /= len;
                    result[1] /= len;
                    result[2] /= len;
                    
                    this.vertNorms[i] = result;
                }
            },
        };

        /**
         *  メタセコ用マテリアル
         */
        var MqoMaterial = function() {
            this.materialList = [];

            // デフォルト
            this.materialList[undefined] = {
                col: [1, 1, 1, 1]
            };
        };

        MqoMaterial.prototype = {
            /**
             *  パース
             */
            parse: function(text) {
                var infoText    = text.match(/^Material [0-9]* \{\r\n([\s\S]*?)\n^\}$/m);
                var matTextList = infoText[1].split('\n');

                for (var i=0,len=matTextList.length; i<len; ++i) {
                    var mat = {};
                    // トリムっとく
                    var matText = matTextList[i].replace(/^\s+|\s+$/g, "");
                    var info = matText.match(/([A-Za-z]+)\(([\w\W]+?)\)/gi);    //マテリアル情報一個分抜く

                    var nl = matText.split(' ');    //マテリアル名取得
                    mat['name'] = nl[0].replace(/"/g, "");

                    for( var j = 0,len2 = info.length; j < len2; ++j ){
                        var m = info[j].match(/([A-Za-z]+)\(([\w\W]+?)\)/); //要素を抜き出す
                        var key = m[1].toLowerCase();   //文字列小文字化
                        var value = null;

                        if( key != "tex" && key != "aplane" ){
                            //テクスチャ以外の要素
                            value = m[2].split(" ");
                            value.forEach(function(elm, i, arr){
                                arr[i] = Number(elm);
                            });
                        }else{
                            //テクスチャの場合
                            value = m[2].replace(/"/g, "");
                        }
                        mat[key] = value;
                    }
                    this.materialList.push(mat);
                }
            }
        };
    })();
}
