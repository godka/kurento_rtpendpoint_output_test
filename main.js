require('date-utils');
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const kurento = require('kurento-client');


const dt = new Date();
const nowTime = dt.toFormat('YYYYMMDD_HH24MISS');
const argv = minimist(process.argv.slice(2), {
    default: {
        ws_uri: 'ws://localhost:8888/kurento',
        file_uri: `file:///home/test/Desktop/nodeKurentoRtpEP/video_tmp/recorder_demo_${nowTime}.webm`,
        video_file: 'file:///home/test/Desktop/nodeKurentoRtpEP/mp4_h264_aac.mp4',
    },
});

const inputSdp = fs.readFileSync(path.join(__dirname, 'input.sdp'), 'utf-8');

(async () => {
    console.log('Start');
    try {
        // Create Kurento Crient
        const {['_']: kurentoClient} = await new Promise((resolve, reject) => {
            kurento(argv.ws_uri, (error, _kurentoClient) => {
                if (error) {
                    reject({msg: 'kurentoClient connect Fail', error});
                }
                // There is no resolve in this code. Why?
                // resolve(_kurentoClient);
                resolve({_: _kurentoClient});
            });
        });
        console.log('kurentoClient Created');

        // Create Pipline
        const {['_']: pipeline} = await new Promise((resolve, reject) => {
            kurentoClient.create('MediaPipeline', (error, _pipeline) => {
                if (error) {
                    reject({msg: 'MediaPipeline create Fail', error});
                }
                // There is no resolve in this code. Why?
                // resolve(_pipeline);
                resolve({_: _pipeline});
            });
        });
        console.log('pipeline Created');

        // Create PlayerEndpoint
        const {['_']: playerEndpoint} = await new Promise((resolve, reject) => {
            pipeline.create(
                'PlayerEndpoint',
                {uri: argv.video_file},
                (error, _playerEndpoint) => {
                    if (error) {
                        reject({
                            msg: 'PlayerEndpoint create Fail',
                            error,
                        });
                    }
                    resolve({_: _playerEndpoint});
                }
            );
        });
        playerEndpoint.on('EndOfStream', (event) => {
            console.log('playerEndpoint : -> EndOfStream', event);
            recordStop();
        });
        console.log('playerEndpoint Created');

        // Create RtpEndpointForPlayer
        const {['_']: RtpEndpointForPlayer} = await new Promise(
            (resolve, reject) => {
                pipeline.create('RtpEndpoint', (error, _rtpEndpoint) => {
                        if (error) {
                            reject({
                                msg: 'RtpEndpointForPlayer create Fail',
                                error}
                            );
                        }
                        resolve({_: _rtpEndpoint});
                    }
                );
            });
        addEventRtpEp(RtpEndpointForPlayer, 'RTP Player');
        console.log('RtpEndpointForPlayer Created');

        // Create RecorderEndpointForPlayer
        const {['_']: RecorderEndpointForPlayer} = await new Promise(
            (resolve, reject) => {
                pipeline.create('RecorderEndpoint', {uri: argv.file_uri},
                    (error, _rtpEndpoint) => {
                        if (error) {
                            reject({msg: 'rtpEndpointTo create Fail', error});
                        }
                        resolve({_: _rtpEndpoint});
                    }
                );
            });
        function recordStop() {
            RecorderEndpointForPlayer.stop();
            console.log('rtpEndpointFrom Record Stop');
        }
        function commonEnd() {
            pipeline.release();
            console.log('Pipeline release');
        }
        process.on('beforeExit', () => {
            recordStop();
            commonEnd();
        });
        process.on('exit', (code) => {
            recordStop();
            commonEnd();
        });
        process.on('SIGINT', function() {
            process.exit();
        });
        console.log('RecorderEndpointForPlayer Created');

        // RtpEndpointForPlayer generate SDP
        const playerAnswerSdp = await new Promise((resolve, reject) => {
            RtpEndpointForPlayer.processOffer(
                inputSdp, (error, answer) => {
                    if (error) {
                        reject({
                            msg: 'RtpEndpointForPlayer generateOffer() Fail',
                            error,
                        });
                    }
                    resolve(answer);
                }
            );
        });
        // Load Answer
        console.log('RtpEndpointForPlayer processAnswer()');

        // Connect playerEndpoint(From) ->  RtpEndpointForPlayer
        await new Promise((resolve, reject) => {
            playerEndpoint.connect(RtpEndpointForPlayer, (error) => {
                if (error) {
                    reject({
                        msg: 'playerEndpoint -> RtpEndpointForPlayer Connect Fail',
                        error,
                    });
                }
                resolve();
            });
        });
        console.log('playerEndpoint -> RtpEndpointForPlayer Connected');

        // Connect playerEndpoint ->  RecorderEndpointForPlayer
        await new Promise((resolve, reject) => {
            playerEndpoint.connect(RecorderEndpointForPlayer, (error) => {
                if (error) {
                    reject({
                        msg: 'playerEndpoint -> RecorderEndpointForPlayer Connect Fail',
                        error,
                    });
                }
                resolve();
            });
        });

        // PlayerEndpoint play()
        await new Promise((resolve, reject) => {
            playerEndpoint.play((error) => {
                if (error) {
                    reject({
                        msg: 'playerEndpoint play() Fail',
                        error,
                    });
                }
                resolve();
            });
        });
        console.log('playerEndpoint Play OK');

        // RecorderEndpointForPlayer recorder()
        await new Promise((resolve, reject) => {
            RecorderEndpointForPlayer.record((error) => {
                if (error) {
                    reject({
                        msg: 'rtpEndpointFrom Record Fail',
                        error,
                    });
                }
                resolve();
            });
        });
        console.log('rtpEndpointFrom Record Start');
        // Save SDP file for playing by VLC
        fs.writeFileSync('./output.sdp', playerAnswerSdp);
    } catch (error) {
        console.error('catch error', error);
    }
    console.log('End');
    function addEventRtpEp(rtpEp, label) {
        rtpEp.on('ConnectionStateChanged', (State) => {
            console.log(
                label + ': -> ConnectionStateChanged ' + State.oldState + ' -> ' + State.newState
            );
        });
        rtpEp.on('ElementConnected', (response) => {
            console.log(label + ': -> ElementConnected' );
        });
        rtpEp.on('ElementDisconnected', (sink, mediaType, srcMDesc, sinkMDesc) => {
            console.log(label + ': -> ElementDisconnected' );
            console.log(label + ': srcMDesc   ' + srcMDesc);
            console.log(label + ': sinkMDesc  ' + sinkMDesc);
        });
        rtpEp.on('Error', function(response) {
            console.log(label + ': -> Error' );
        });
        // rtpEp.on('Media', function(response) {
        //     console.log(label + ': -> ' );
        // });
        rtpEp.on('MediaFlowInStateChange', function(response) {
            console.log(label + ': -> MediaFlowInStateChange' );
        });
        rtpEp.on('MediaFlowOutStateChange', function(response) {
            console.log(label + ': -> MediaFlowOutStateChange' );
        });
        rtpEp.on('MediaSessionStarted', function(response) {
            console.log(label + ': -> MediaSessionStarted' );
        });
        rtpEp.on('MediaSessionTerminated', function(response) {
            console.log(label + ': -> MediaSessionTerminated' );
        });
        rtpEp.on('MediaStateChanged', function(response) {
            console.log(label + ': -> MediaStateChanged' );
        });
        // rtpEp.on('ObjectCreated', function(response) {
        //     console.log(label + ': -> ' );
        // });
        // rtpEp.on('ObjectDestroyed', function(response) {
        //     console.log(label + ': -> ' );
        // });
        // rtpEp.on('RaiseBase', function(response) {
        //     console.log(label + ': -> ' );
        // });
        // rtpEp.on('UriEndpointStateChanged', function(response) {
        //     console.log(label + ': -> ' );
        // });
    }
})();
