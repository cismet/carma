/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.cismet.carma;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 *
 * @author jruiz
 */
@JsonAutoDetect(
    fieldVisibility = JsonAutoDetect.Visibility.ANY,
    isGetterVisibility = JsonAutoDetect.Visibility.ANY,
    getterVisibility = JsonAutoDetect.Visibility.ANY,
    setterVisibility = JsonAutoDetect.Visibility.ANY
)
@JsonIgnoreProperties(ignoreUnknown = true)
public class CarmaDescription {

    private String self;
    private String base;
    private String name;
    private String[] buildArgs;
    private String[] execArgs;
    private String[] execJars;
    private String buildWorkingDir;

    public String getSelf() {
        return self;
    }

    public void setSelf(String self) {
        this.self = self;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }        

    public String getBase() {
        return base;
    }

    public void setBase(final String base) {
        this.base = base;
    }

    public String[] getBuildArgs() {
        return buildArgs;
    }

    public void setBuildArgs(final String[] buildArgs) {
        this.buildArgs = buildArgs;
    }

    public String[] getExecArgs() {
        return execArgs;
    }

    public void setExecArgs(final String[] execArgs) {
        this.execArgs = execArgs;
    }

    public String[] getExecJars() {
        return execJars;
    }

    public void setExecJars(final String[] execJars) {
        this.execJars = execJars;
    }

    public String getBuildWorkingDir() {
        return buildWorkingDir;
    }

    public void setBuildWorkingDir(final String buildWorkingDir) {
        this.buildWorkingDir = buildWorkingDir;
    }

}